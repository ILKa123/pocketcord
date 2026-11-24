package com.pocketcord.app

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Уведомления в шторке: `window.PcNotify` в JS.
 * Решение «показывать или нет» принимает JS (знает про заглушённые каналы, упоминания и т.п.).
 */
class NotifyBridge(private val activity: Activity) {
  companion object {
    /** История сообщений по каналу — чтобы в шторке было несколько последних, как в Discord. */
    val history = HashMap<String, ArrayList<NotificationCompat.MessagingStyle.Message>>()

    /** Убрать уведомление чата (открыт, прочитан, ответили из шторки). */
    fun cancel(ctx: Context, cid: String) {
      synchronized(history) { history.remove(cid) }
      NotificationManagerCompat.from(ctx).cancel(cid.hashCode())
    }

    const val CH_MESSAGES = "messages"
    const val CH_SERVICE = "service"
    const val EXTRA_CHANNEL = "pc_channel"
    const val EXTRA_GUILD = "pc_guild"
    private const val DISCORD_PKG = "com.discord"

    fun ensureChannels(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CH_MESSAGES, "Сообщения", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Личные сообщения и упоминания"
        enableVibration(true)
      })
      nm.createNotificationChannel(NotificationChannel(CH_SERVICE, "Фоновое подключение", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Держит связь с Discord, пока Pocketcord свёрнут"
        setShowBadge(false)
      })
    }
  }

  private val ctx: Context get() = activity.applicationContext
  /** История сообщений по каналу — чтобы в шторке было несколько последних, как в Discord. */
  private val history get() = Companion.history
  private val avatars = HashMap<String, IconCompat?>()

  init { ensureChannels(ctx) }

  @JavascriptInterface
  fun enabled(): Boolean = NotificationManagerCompat.from(ctx).areNotificationsEnabled()

  @JavascriptInterface
  fun requestPermission() {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      activity.runOnUiThread { ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 41) }
    }
  }

  @JavascriptInterface
  fun discordInstalled(): Boolean = try {
    activity.packageManager.getPackageInfo(DISCORD_PKG, 0); true
  } catch (_: Exception) { false }

  /** Открывает системные настройки уведомлений официального Discord — там их можно выключить. */
  @JavascriptInterface
  fun openDiscordSettings() = openAppNotificationSettings(DISCORD_PKG)

  @JavascriptInterface
  fun openOwnSettings() = openAppNotificationSettings(ctx.packageName)

  private fun openAppNotificationSettings(pkg: String) {
    activity.runOnUiThread {
      val i = if (Build.VERSION.SDK_INT >= 26)
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
      else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(android.net.Uri.parse("package:$pkg"))
      try { activity.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
    }
  }

  /** Фоновая служба: не даёт системе выгрузить приложение, пока оно свёрнуто. */
  @JavascriptInterface
  fun keepAlive(on: Boolean) {
    val i = Intent(ctx, KeepAliveService::class.java)
    try {
      if (on) ContextCompat.startForegroundService(ctx, i) else ctx.stopService(i)
    } catch (_: Exception) {}
  }

  /**
   * json: {channel, guild, title, group, author, authorId, avatar, text, ts}
   * title — заголовок беседы (для ЛС — пусто), group — true для групп/серверов.
   */
  /** Какой канал открыть: приложение запустили нажатием на уведомление. */
  @JavascriptInterface
  fun pendingOpen(): String {
    val v = MainActivity.pendingOpen ?: return ""
    MainActivity.pendingOpen = null
    return v
  }

  // Аватар качается из сети — не держим JS, делаем всё в отдельном потоке.
  @JavascriptInterface
  fun show(json: String) { Thread { try { post(json) } catch (_: Exception) {} }.start() }

  private fun post(json: String) {
    val j = JSONObject(json)
    val cid = j.getString("channel")
    val authorId = j.optString("authorId")
    val icon = avatars.getOrPut(authorId) { loadAvatar(j.optString("avatar")) }
    val person = Person.Builder().setName(j.optString("author")).setKey(authorId).setIcon(icon).build()
    val msg = NotificationCompat.MessagingStyle.Message(j.optString("text"), j.optLong("ts", System.currentTimeMillis()), person)
    val list = synchronized(history) {
      history.getOrPut(cid) { ArrayList() }.apply { add(msg); while (size > 6) removeAt(0) }.toList()
    }
    val me = Person.Builder().setName("Вы").build()
    val style = NotificationCompat.MessagingStyle(me)
    val title = j.optString("title")
    if (title.isNotEmpty()) style.conversationTitle = title
    style.isGroupConversation = j.optBoolean("group")
    list.forEach { style.addMessage(it) }

    val open = Intent(ctx, MainActivity::class.java)
      .setAction("com.pocketcord.app.OPEN_CHAT.$cid")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      .putExtra(EXTRA_CHANNEL, cid).putExtra(EXTRA_GUILD, j.optString("guild"))
    val pi = PendingIntent.getActivity(ctx, cid.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    // Беседа = ярлык (shortcut). Без него Android не покажет уведомление как чат и не даст «пузырь».
    val group = j.optBoolean("group")
    val chatName = title.ifEmpty { j.optString("author") }
    val chatIcon = if (group) IconCompat.createWithResource(ctx, R.mipmap.ic_launcher)
      else (Avatars.get(j.optString("avatar"))?.let { IconCompat.createWithAdaptiveBitmap(padForAdaptive(it)) }
        ?: IconCompat.createWithResource(ctx, R.mipmap.ic_launcher))
    val shortcutId = "ch_$cid"
    try {
      val sc = ShortcutInfoCompat.Builder(ctx, shortcutId)
        .setLongLived(true)
        .setShortLabel(chatName.take(24).ifEmpty { "Чат" })
        .setLongLabel(chatName.ifEmpty { "Чат" })
        .setIcon(chatIcon)
        .setIntent(Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
          .putExtra(EXTRA_CHANNEL, cid).putExtra(EXTRA_GUILD, j.optString("guild")))
        .apply { if (!group) setPerson(person) }
        .build()
      ShortcutManagerCompat.pushDynamicShortcut(ctx, sc)
    } catch (_: Exception) {}

    // Кнопки как у Telegram: «Ответить» прямо из шторки и «Пометить прочитанным».
    val mutable = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
    val replyPi = PendingIntent.getBroadcast(ctx, cid.hashCode() + 3,
      Intent(ctx, NotifyActionReceiver::class.java).setAction(NotifyActionReceiver.ACTION_REPLY).putExtra(EXTRA_CHANNEL, cid),
      PendingIntent.FLAG_UPDATE_CURRENT or mutable)
    val replyAction = NotificationCompat.Action.Builder(R.drawable.ic_notify, "Ответить", replyPi)
      .addRemoteInput(androidx.core.app.RemoteInput.Builder(NotifyActionReceiver.KEY_TEXT).setLabel("Сообщение…").build())
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()
    val readPi = PendingIntent.getBroadcast(ctx, cid.hashCode() + 4,
      Intent(ctx, NotifyActionReceiver::class.java).setAction(NotifyActionReceiver.ACTION_READ)
        .putExtra(EXTRA_CHANNEL, cid).putExtra(NotifyActionReceiver.EXTRA_MID, j.optString("mid")),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val readAction = NotificationCompat.Action.Builder(R.drawable.ic_notify, "Пометить прочитанным", readPi)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
      .setShowsUserInterface(false)
      .build()

    // Нажатие ведёт прямо в приложение (как у Telegram) — тогда Xiaomi умеет открыть его
    // плавающим окном, если уведомление смахнуть вниз.
    val n = NotificationCompat.Builder(ctx, CH_MESSAGES)
      .setSmallIcon(R.drawable.ic_notify)
      .setColor(0xFF5865F2.toInt())
      .setStyle(style)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(pi)
      .addAction(replyAction)
      .addAction(readAction)
      .setShortcutId(shortcutId)
      .setLocusId(androidx.core.content.LocusIdCompat(shortcutId))
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .setGroup("pc_messages")
      .build()
    try { NotificationManagerCompat.from(ctx).notify(cid.hashCode(), n) } catch (_: SecurityException) {}
  }

  /** Аватар для адаптивной иконки: картинка должна занимать центральные ~2/3. */
  private fun padForAdaptive(src: Bitmap): Bitmap {
    val s = src.width
    val out = Bitmap.createBitmap((s * 1.5f).toInt(), (s * 1.5f).toInt(), Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    c.drawColor(0xFF313338.toInt())
    c.drawBitmap(src, (out.width - s) / 2f, (out.height - s) / 2f, null)
    return out
  }

  /** Канал открыт или прочитан в другом клиенте — убираем уведомление. */
  @JavascriptInterface
  fun clear(cid: String) = cancel(ctx, cid)

  @JavascriptInterface
  fun clearAll() {
    synchronized(history) { history.clear() }
    NotificationManagerCompat.from(ctx).cancelAll()
  }

  private fun loadAvatar(url: String): IconCompat? = Avatars.get(url)?.let { IconCompat.createWithBitmap(it) }

  // ---------- хранилище (Настройки → Сообщения → Хранилище) ----------
  private fun dirSize(f: java.io.File?): Long {
    if (f == null || !f.exists()) return 0
    if (f.isFile) return f.length()
    return f.listFiles()?.sumOf { dirSize(it) } ?: 0
  }

  /** {"app": размер APK, "data": данные (вход, настройки), "cache": кэш картинок} в байтах. */
  @JavascriptInterface
  fun storageInfo(): String {
    val app = java.io.File(ctx.applicationInfo.sourceDir).length()
    val cache = dirSize(ctx.cacheDir) + dirSize(ctx.codeCacheDir)
    val dataAll = dirSize(java.io.File(ctx.applicationInfo.dataDir))
    return JSONObject().put("app", app).put("cache", cache).put("data", maxOf(0, dataAll - cache)).toString()
  }

  /** Очистить кэш картинок/GIF. Вход, настройки, тема и избранное не трогаются. */
  @JavascriptInterface
  fun clearCache() {
    activity.runOnUiThread { try { BubbleHub.web?.get()?.clearCache(true) } catch (_: Exception) {} }
    Thread {
      try { ctx.cacheDir.listFiles()?.forEach { it.deleteRecursively() } } catch (_: Exception) {}
    }.start()
  }

  // ---------- значок приложения (Настройки → Оформление) ----------
  private val iconIds = listOf("default", "lilac", "pink", "sunset", "blurple", "flushed", "owo", "bunny", "ocean")
  private fun alias(id: String) = android.content.ComponentName(ctx.packageName, "com.pocketcord.app.Icon_$id")

  /** Какой значок сейчас включён. */
  @JavascriptInterface
  fun getAppIcon(): String = iconIds.firstOrNull {
    val s = ctx.packageManager.getComponentEnabledSetting(alias(it))
    s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (s == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && it == "default")
  } ?: "default"

  /** Включить один «вход» с нужным значком и выключить остальные (лаунчер обновит значок сам). */
  @JavascriptInterface
  fun setAppIcon(id: String) {
    if (id !in iconIds) return
    val pm = ctx.packageManager
    pm.setComponentEnabledSetting(alias(id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    for (other in iconIds) if (other != id)
      pm.setComponentEnabledSetting(alias(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
  }

  /** Приложение сейчас в плавающем окне / разделённом экране. */
  @JavascriptInterface
  fun isFloating(): Boolean = activity.isInMultiWindowMode
}

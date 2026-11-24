package com.pocketcord.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

class MainActivity : TauriActivity() {
  companion object {
    /** {"channel","guild"} из уведомления, которое ещё не обработал JS. */
    @Volatile var pendingOpen: String? = null
  }

  private var web: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Отступ сверху под статус-бар и снизу под клавиатуру (контент рисуется под системными панелями).
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(0xFF1E1F22.toInt())
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val top = insets.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(0, top.top, 0, ime.bottom)
      insets
    }
    hideNavigation()
    rememberOpen(intent)
    ensureLauncherIcon()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    web = webView
    BubbleHub.web = java.lang.ref.WeakReference(webView)
    webView.addJavascriptInterface(ClipBridge(this), "PcClip")
    webView.addJavascriptInterface(NotifyBridge(this), "PcNotify")
  }

  // Нажатие на уведомление, когда приложение уже открыто
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (rememberOpen(intent)) web?.post { web?.evaluateJavascript("window.onNotifyOpen && window.onNotifyOpen()", null) }
  }

  /** Если ни один значок не включён (например, выбранный вариант убрали в обновлении) — вернуть классический. */
  private fun ensureLauncherIcon() {
    try {
      val pm = packageManager
      val q = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(packageName)
      if (pm.queryIntentActivities(q, 0).isEmpty()) {
        pm.setComponentEnabledSetting(android.content.ComponentName(packageName, "com.pocketcord.app.Icon_default"),
          android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP)
      }
    } catch (_: Exception) {}
  }

  private fun rememberOpen(intent: Intent?): Boolean {
    val cid = intent?.getStringExtra(NotifyBridge.EXTRA_CHANNEL) ?: return false
    pendingOpen = JSONObject().put("channel", cid).put("guild", intent.getStringExtra(NotifyBridge.EXTRA_GUILD) ?: "").toString()
    intent.removeExtra(NotifyBridge.EXTRA_CHANNEL)
    return true
  }

  // Стали плавающим окном (смахнули уведомление вниз) — как у Discord: сразу серверы и ЛС.
  override fun onMultiWindowModeChanged(isInMultiWindowMode: Boolean, newConfig: android.content.res.Configuration) {
    super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig)
    if (isInMultiWindowMode) web?.post { web?.evaluateJavascript("window.onBubbleShown && window.onBubbleShown()", null) }
  }

  override fun onDestroy() {
    if (isFinishing) stopService(Intent(this, KeepAliveService::class.java))
    super.onDestroy()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideNavigation()
  }

  /** Прячем кнопки навигации Android; они появляются по свайпу от нижнего края. */
  private fun hideNavigation() {
    val c = WindowCompat.getInsetsController(window, window.decorView)
    c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    c.isAppearanceLightStatusBars = false
    c.hide(WindowInsetsCompat.Type.navigationBars())
  }
}

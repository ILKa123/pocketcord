package com.pocketcord.app

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Пустая foreground-служба: пока она работает, Android (и MIUI) не выгружает процесс,
 * и соединение с Discord живёт, даже когда приложение свёрнуто.
 *
 * Android требует, чтобы у такой службы было уведомление. Но его можно скрыть, выключив
 * канал «Фоновое подключение» в настройках, — служба при этом продолжит работать.
 * Нажатие на уведомление сразу открывает эту настройку.
 */
class KeepAliveService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    NotifyBridge.ensureChannels(this)
    val hide = if (Build.VERSION.SDK_INT >= 26)
      Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        .putExtra(Settings.EXTRA_CHANNEL_ID, NotifyBridge.CH_SERVICE)
    else Intent(this, MainActivity::class.java)
    val pi = PendingIntent.getActivity(this, 0, hide.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(this, NotifyBridge.CH_SERVICE)
      .setSmallIcon(R.drawable.ic_notify)
      .setContentTitle("Pocketcord на связи")
      .setContentText("Нажмите и выключите — значок пропадёт, сообщения продолжат приходить")
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setSilent(true)
      .setShowWhen(false)
      .setContentIntent(pi)
      .build()
    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING else 0
    try { ServiceCompat.startForeground(this, 7, n, type) } catch (_: Exception) { stopSelf() }
    return START_NOT_STICKY
  }

  // Приложение смахнули из недавних — веб-часть уничтожена, держать процесс незачем.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }
}

package com.pocketcord.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.webkit.WebView
import androidx.core.app.RemoteInput
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap

/** Доступ к WebView приложения из нативного кода (кнопки уведомлений и т.п.). */
object BubbleHub {
  @Volatile var web: WeakReference<WebView>? = null
  private val openChannels = ConcurrentHashMap.newKeySet<String>()

  fun isOpen(cid: String) = cid in openChannels

  /** Выполнить JS в приложении. false — приложение выгружено. */
  fun eval(js: String): Boolean {
    val w = web?.get() ?: return false
    w.post { w.evaluateJavascript(js, null) }
    return true
  }
}

/** Кнопки в уведомлении: «Ответить» (прямо из шторки) и «Пометить прочитанным», как в Telegram. */
class NotifyActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_REPLY = "com.pocketcord.app.REPLY"
    const val ACTION_READ = "com.pocketcord.app.READ"
    const val KEY_TEXT = "pc_reply_text"
    const val EXTRA_MID = "pc_mid"
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    val cid = intent.getStringExtra(NotifyBridge.EXTRA_CHANNEL) ?: return
    val q = { s: String -> JSONObject.quote(s) }
    when (intent.action) {
      ACTION_REPLY -> {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_TEXT)?.toString()?.trim()
        if (!text.isNullOrEmpty()) BubbleHub.eval("window.notifyReply && window.notifyReply(${q(cid)}, ${q(text)})")
      }
      ACTION_READ -> {
        val mid = intent.getStringExtra(EXTRA_MID) ?: ""
        BubbleHub.eval("window.notifyMarkRead && window.notifyMarkRead(${q(cid)}, ${q(mid)})")
      }
    }
    NotifyBridge.cancel(ctx, cid)
  }
}

package com.pocketcord.app

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Доступ к картинке в буфере обмена из JS: `window.PcClip`.
 * WebView сам не отдаёт картинки из буфера в событие paste, поэтому читаем их нативно.
 */
class ClipBridge(private val activity: Activity) {
  private val cm get() = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  /** Буфер обмена читается только из UI-потока, пока окно в фокусе. */
  private fun <T> onUi(block: () -> T): T? {
    var out: T? = null
    val latch = CountDownLatch(1)
    activity.runOnUiThread {
      try { out = block() } catch (_: Throwable) {} finally { latch.countDown() }
    }
    latch.await(3, TimeUnit.SECONDS)
    return out
  }

  /** Метка картинки в буфере (время копирования) или "" если картинки нет. Сам буфер не читает. */
  @JavascriptInterface
  fun imageStamp(): String = onUi {
    val d = cm.primaryClipDescription ?: return@onUi ""
    var img = false
    for (i in 0 until d.mimeTypeCount) if (d.getMimeType(i).startsWith("image/")) img = true
    if (!img) return@onUi ""
    val ts = if (Build.VERSION.SDK_INT >= 26) d.timestamp else 1L
    ts.toString()
  } ?: ""

  /** JSON {name, mime, data(base64)} или "" если в буфере нет картинки. */
  @JavascriptInterface
  fun readImage(): String = onUi {
    val clip = cm.primaryClip ?: return@onUi ""
    for (i in 0 until clip.itemCount) {
      val uri = clip.getItemAt(i).uri ?: continue
      val mime = activity.contentResolver.getType(uri) ?: clip.description.getMimeType(0)
      if (!mime.startsWith("image/")) continue
      val bytes = activity.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: continue
      if (bytes.size > 10 * 1024 * 1024) return@onUi JSONObject().put("error", "too_big").toString()
      val ext = mime.substringAfter('/').substringBefore('+').ifEmpty { "png" }
      return@onUi JSONObject()
        .put("name", "image.$ext")
        .put("mime", mime)
        .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        .toString()
    }
    ""
  } ?: ""
}

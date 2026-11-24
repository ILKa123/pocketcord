package com.pocketcord.app

import android.os.Build
import android.util.Base64
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.webkit.WebView
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat
import org.json.JSONObject

/**
 * Вставка картинок с клавиатуры (буфер обмена Gboard/MIUI, стикеры).
 * WebView по умолчанию говорит клавиатуре «картинки не принимаю»; здесь мы объявляем
 * поддержку картинок (image/ любого типа) и передаём полученный файл в JS: window.onNativeImage(json).
 * Подключается из RustWebView.onCreateInputConnection (патч в tools/build-apk.ps1).
 */
object ImageInput {
  private val MIMES = arrayOf("image/*", "image/png", "image/jpeg", "image/gif", "image/webp")

  @JvmStatic
  fun wrap(view: WebView, ic: InputConnection?, outAttrs: EditorInfo): InputConnection? {
    if (ic == null) return null
    EditorInfoCompat.setContentMimeTypes(outAttrs, MIMES)
    @Suppress("DEPRECATION")
    return InputConnectionCompat.createWrapper(ic, outAttrs) { info, flags, _ -> receive(view, info, flags) }
  }

  private fun receive(view: WebView, info: InputContentInfoCompat, flags: Int): Boolean {
    val mime = (0 until info.description.mimeTypeCount)
      .map { info.description.getMimeType(it) }.firstOrNull { it.startsWith("image/") } ?: return false
    if (Build.VERSION.SDK_INT >= 25 && (flags and InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0) {
      try { info.requestPermission() } catch (_: Exception) { return false }
    }
    Thread {
      val json = try {
        val bytes = view.context.contentResolver.openInputStream(info.contentUri)?.use { it.readBytes() }
        when {
          bytes == null -> JSONObject().put("error", "read")
          bytes.size > 10 * 1024 * 1024 -> JSONObject().put("error", "too_big")
          else -> {
            val ext = mime.substringAfter('/').substringBefore('+').let { if (it == "*") "png" else it }
            JSONObject().put("name", "image.$ext").put("mime", if (mime == "image/*") "image/png" else mime)
              .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
          }
        }
      } catch (_: Exception) {
        JSONObject().put("error", "read")
      } finally {
        try { info.releasePermission() } catch (_: Exception) {}
      }
      val arg = JSONObject.quote(json.toString())
      view.post { view.evaluateJavascript("window.onNativeImage && window.onNativeImage($arg)", null) }
    }.start()
    return true
  }
}

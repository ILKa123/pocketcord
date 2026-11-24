package com.pocketcord.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/** Круглые аватарки из CDN Discord с кэшем — для уведомлений и мини-чата. Вызывать не из UI-потока. */
object Avatars {
  private val cache = ConcurrentHashMap<String, Bitmap>()
  private val failed = ConcurrentHashMap.newKeySet<String>()

  fun get(url: String): Bitmap? {
    if (!url.startsWith("https://")) return null
    cache[url]?.let { return it }
    if (url in failed) return null
    return try {
      val c = URL(url.replace(".webp", ".png")).openConnection() as HttpURLConnection
      c.connectTimeout = 3000; c.readTimeout = 3000
      val src = c.inputStream.use { BitmapFactory.decodeStream(it) } ?: return null
      circle(src).also { cache[url] = it }
    } catch (_: Exception) { failed.add(url); null }
  }

  private fun circle(src: Bitmap): Bitmap {
    val s = minOf(src.width, src.height)
    val out = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    c.drawCircle(s / 2f, s / 2f, s / 2f, p)
    p.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    c.drawBitmap(src, Rect(0, 0, s, s), Rect(0, 0, s, s), p)
    return out
  }
}

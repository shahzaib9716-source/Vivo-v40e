package expo.modules.havendevice

import android.app.Activity
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.WindowManager
import kotlin.math.roundToInt

internal object HavenWindow {
  private fun visible(activity: Activity): Boolean {
    val window = activity.window
    return !activity.isFinishing && !activity.isDestroyed && activity.hasWindowFocus() &&
      window.decorView.isShown && window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE == 0
  }

  fun capture(activity: Activity, done: (Result<String>) -> Unit) {
    val main = Handler(Looper.getMainLooper())
    main.post {
      try {
        require(Build.VERSION.SDK_INT >= 26 && visible(activity)) { "Open the Haven screen first." }
        val view = activity.window.decorView
        check(view.width > 0 && view.height > 0)
        val scale = minOf(1.0, 1280.0 / maxOf(view.width, view.height))
        val bitmap = Bitmap.createBitmap((view.width * scale).roundToInt().coerceAtLeast(1), (view.height * scale).roundToInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        try {
          PixelCopy.request(activity.window, bitmap, { code ->
            if (code != PixelCopy.SUCCESS || !visible(activity)) {
              bitmap.recycle()
              done(Result.failure(IllegalStateException("Haven screen is unavailable.")))
            } else Thread {
              val picture = runCatching { CheckinImage.encode(bitmap, 180000) }
              main.post { done(if (visible(activity)) picture else Result.failure(IllegalStateException("Haven left the foreground."))) }
            }.start()
          }, main)
        } catch (e: Exception) { bitmap.recycle(); throw e }
      } catch (e: Exception) { done(Result.failure(e)) }
    }
  }
}

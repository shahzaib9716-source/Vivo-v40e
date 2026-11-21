package expo.modules.havendevice

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

object CheckinImage {
  fun preview(resolver: ContentResolver, uri: Uri): String {
    require(uri.scheme == ContentResolver.SCHEME_CONTENT)
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
    require(options.outWidth > 0 && options.outHeight > 0)
    var sample = 1
    while (maxOf(options.outWidth, options.outHeight) / sample > 1600) sample *= 2
    options.inJustDecodeBounds = false
    options.inSampleSize = sample
    val image = requireNotNull(resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) })
    val orientation = runCatching {
      resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }
    }.getOrNull()
    val matrix = Matrix().apply {
      when (orientation) {
        2 -> setScale(-1f, 1f)
        3 -> setRotate(180f)
        4 -> setScale(1f, -1f)
        5 -> { setRotate(90f); postScale(-1f, 1f) }
        6 -> setRotate(90f)
        7 -> { setRotate(-90f); postScale(-1f, 1f) }
        8 -> setRotate(-90f)
      }
    }
    val preview = Bitmap.createBitmap(image, 0, 0, image.width, image.height, matrix, true)
    if (preview !== image) image.recycle()
    return encode(preview, 180000)
  }

  fun encode(image: Bitmap, byteLimit: Int): String {
    var preview = image
    try {
      while (true) {
        val bytes = ByteArrayOutputStream()
        check(preview.compress(Bitmap.CompressFormat.JPEG, 78, bytes))
        if (bytes.size() <= byteLimit) return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
        val next = Bitmap.createScaledBitmap(preview, (preview.width * 3 / 4).coerceAtLeast(1), (preview.height * 3 / 4).coerceAtLeast(1), true)
        preview.recycle()
        preview = next
      }
    } finally { preview.recycle() }
  }
}

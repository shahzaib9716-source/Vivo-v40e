package expo.modules.havendevice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat

class CheckinCameraActivity : ComponentActivity() {
  private lateinit var frame: FrameLayout
  private lateinit var status: TextView
  private lateinit var shutter: Button
  private lateinit var switch: Button
  private lateinit var allow: Button
  private var provider: ProcessCameraProvider? = null
  private var surface: PreviewView? = null
  private var front = false
  private var resumed = false
  private var generation = 0
  private var bound: Preview? = null
  private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    front = saved?.getBoolean("front") ?: false
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    frame = FrameLayout(this)
    layout.addView(frame, LinearLayout.LayoutParams(-1, 0, 1f))
    status = TextView(this).also { it.accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE; layout.addView(it) }
    fun button(label: String, action: () -> Unit) = Button(this).apply {
      text = label
      setOnClickListener { action() }
      layout.addView(this)
    }
    allow = button("Allow camera") { permission.launch(Manifest.permission.CAMERA) }
    switch = button("Switch camera") { front = !front; refresh() }
    shutter = button("Take photo") { capture() }
    button("Cancel") { finish() }
    setContentView(layout)
  }

  override fun onSaveInstanceState(state: Bundle) {
    state.putBoolean("front", front)
    super.onSaveInstanceState(state)
  }
  override fun onResume() {
    super.onResume()
    resumed = true
    refresh()
  }
  override fun onPause() {
    resumed = false
    release()
    super.onPause()
  }

  private fun release() {
    generation++
    surface?.previewStreamState?.removeObservers(this)
    surface = null
    bound?.let { provider?.unbind(it) }
    bound = null
    frame.removeAllViews()
    shutter.isEnabled = false
    switch.isEnabled = false
  }

  private fun refresh() {
    if (!resumed) return
    release()
    val permitted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    allow.visibility = if (permitted) android.view.View.GONE else android.view.View.VISIBLE
    if (!permitted) {
      status.text = "Allow camera access to see a preview."
      return
    }
    status.text = "Opening camera…"
    val current = generation
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener({
      if (!resumed || generation != current) return@addListener
      try {
        val camera = future.get()
        provider = camera
        val hasFront = camera.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
        val hasBack = camera.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
        check(hasFront || hasBack)
        front = hasFront && (front || !hasBack)
        val selector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        val preview = PreviewView(this).apply {
          implementationMode = PreviewView.ImplementationMode.COMPATIBLE
          scaleType = PreviewView.ScaleType.FIT_CENTER
        }
        frame.addView(preview)
        surface = preview
        val use = Preview.Builder().build()
        use.setSurfaceProvider(preview.surfaceProvider)
        bound = use
        camera.bindToLifecycle(this, selector, use)
        switch.isEnabled = hasFront && hasBack
        val lens = if (front) "Front camera" else "Back camera"
        status.text = lens
        preview.previewStreamState.observe(this) {
          if (current == generation) shutter.isEnabled = it == PreviewView.StreamState.STREAMING
        }
      } catch (e: Exception) {
        release()
        status.text = "Camera unavailable. Close other camera apps and reopen the check-in."
      }
    }, ContextCompat.getMainExecutor(this))
  }

  private fun capture() {
    if (!resumed || !hasWindowFocus() || !shutter.isEnabled) return
    val photo = surface?.bitmap
    if (photo == null) { status.text = "Preview is not ready. Try again."; return }
    shutter.isEnabled = false
    switch.isEnabled = false
    val current = generation
    Thread {
      val data = runCatching { CheckinImage.encode(photo, 90000) }
      runOnUiThread {
        if (!resumed || current != generation || isFinishing) return@runOnUiThread
        data.onSuccess { jpeg ->
          setResult(Activity.RESULT_OK, Intent().putExtra("jpeg", jpeg))
          finish()
        }.onFailure {
          refresh()
          status.text = "Could not prepare the photo. Try again."
        }
      }
    }.start()
  }
}

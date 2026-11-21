package expo.modules.havendevice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File

class VoiceNoteActivity : Activity() {
  private lateinit var file: File
  private lateinit var layout: LinearLayout
  private lateinit var status: TextView
  private var recorder: MediaRecorder? = null
  private var player: MediaPlayer? = null
  private var ready = false
  private var readOnly = false
  private val handler = Handler(Looper.getMainLooper())
  private val limit = Runnable { finishRecording() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)
    file = File(cacheDir, "haven-voice-preview.m4a")
    file.delete()
    val audio = intent.getStringExtra("audio")
    readOnly = audio != null
    if (audio != null) {
      try {
        require(audio.length in 1..240000)
        file.writeBytes(Base64.decode(audio, Base64.DEFAULT))
        ready = true
      } catch (_: Exception) { finish(); return }
    }
    layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      val pad = (24 * resources.displayMetrics.density).toInt()
      setPadding(pad, pad, pad, pad)
    }
    setContentView(layout)
    draw(if (readOnly) "Voice note" else "Record up to 30 seconds. You can listen before sharing.")
  }

  private fun button(label: String, action: () -> Unit) {
    layout.addView(Button(this).apply { text = label; setOnClickListener { action() } })
  }

  private fun draw(message: String) {
    layout.removeAllViews()
    status = TextView(this).apply { text = message; textSize = 20f; gravity = Gravity.CENTER }
    layout.addView(status)
    if (recorder != null) button("Stop recording") { finishRecording() }
    else {
      if (ready) {
        button("Play note") { play() }
        if (!readOnly) button("Use this recording") {
          if (file.length() in 1L..180000L) {
            val encoded = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
            setResult(RESULT_OK, Intent().putExtra("audio", encoded))
            finish()
          }
        }
      }
      if (!readOnly) button(if (ready) "Record again" else "Start recording") {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) record()
        else requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2)
      }
    }
    button(if (readOnly) "Close" else "Cancel") { finish() }
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == 2) draw(if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
      "Microphone enabled. Tap Start recording when ready." else "Microphone access is required to record a note.")
  }

  @Suppress("DEPRECATION")
  private fun record() {
    stopPlayer()
    ready = false
    try {
      val session = MediaRecorder()
      recorder = session
      session.setAudioSource(MediaRecorder.AudioSource.MIC)
      session.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      session.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      session.setAudioSamplingRate(22050)
      session.setAudioEncodingBitRate(32000)
      session.setOutputFile(file.absolutePath)
      session.prepare()
      session.start()
      draw("Recording your voice note…")
      handler.postDelayed(limit, 30000L)
    } catch (_: Exception) {
      recorder?.release()
      recorder = null
      draw("Recording failed. Check microphone access and try again.")
    }
  }

  private fun finishRecording() {
    val session = recorder ?: return
    recorder = null
    handler.removeCallbacks(limit)
    ready = try { session.stop(); file.length() in 1L..180000L }
      catch (_: RuntimeException) { false }
      finally { session.release() }
    draw(if (ready) "Recording stopped. Listen or use this note." else "No usable recording. Try recording again.")
  }

  private fun stopPlayer() { player?.release(); player = null }

  private fun play() {
    stopPlayer()
    try {
      val sound = MediaPlayer()
      player = sound
      sound.setDataSource(file.absolutePath)
      sound.setOnPreparedListener { it.start(); status.text = "Playing voice note…" }
      sound.setOnCompletionListener { stopPlayer(); status.text = "Playback finished." }
      sound.setOnErrorListener { _, _, _ -> stopPlayer(); status.text = "Unable to play this note."; true }
      sound.prepareAsync()
    } catch (_: Exception) { stopPlayer(); status.text = "Unable to play this note." }
  }

  override fun onPause() {
    finishRecording()
    stopPlayer()
    super.onPause()
  }

  override fun onDestroy() {
    handler.removeCallbacks(limit)
    stopPlayer()
    file.delete()
    super.onDestroy()
  }
}

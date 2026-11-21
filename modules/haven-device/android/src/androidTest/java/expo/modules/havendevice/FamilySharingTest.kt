package expo.modules.havendevice

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FamilySharingTest {
  private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
  private val context: Context get() = instrumentation.targetContext

  private fun grant(permission: String) {
    instrumentation.uiAutomation.grantRuntimePermission(context.packageName, permission)
  }

  private fun buttons(view: View): List<Button> = when (view) {
    is Button -> listOf(view)
    is ViewGroup -> (0 until view.childCount).flatMap { buttons(view.getChildAt(it)) }
    else -> emptyList()
  }

  private fun tap(activity: Activity, label: String) {
    buttons(activity.window.decorView).single { it.text.toString() == label }.performClick()
  }

  private fun awaitState(check: () -> Boolean) {
    val end = SystemClock.elapsedRealtime() + 25000
    while (!check() && SystemClock.elapsedRealtime() < end) SystemClock.sleep(50)
    assertTrue(check())
  }

  @Test fun copiesTheVisibleHavenWindowAndRejectsProtectedContent() {
    ActivityScenario.launch<VoiceNoteActivity>(Intent(context, VoiceNoteActivity::class.java)).use { screen ->
      screen.onActivity { a ->
        a.setContentView(View(a).apply { setBackgroundColor(android.graphics.Color.MAGENTA) })
      }
      instrumentation.waitForIdleSync()
      fun capture(): Result<String> {
        val completed = java.util.concurrent.CompletableFuture<Result<String>>()
        screen.onActivity { a -> HavenWindow.capture(a) { completed.complete(it) } }
        return completed.get(10, java.util.concurrent.TimeUnit.SECONDS)
      }
      awaitState {
        val jpeg = capture().getOrNull()
        if (jpeg == null) false else {
          val bytes = Base64.decode(jpeg, Base64.NO_WRAP)
          val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
          val pixel = bitmap.getPixel(bitmap.width / 2, bitmap.height / 2)
          bitmap.recycle()
          android.graphics.Color.red(pixel) > 245 && android.graphics.Color.blue(pixel) > 245 && android.graphics.Color.green(pixel) < 10
        }
      }
      screen.onActivity { it.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE) }
      assertTrue(capture().isFailure)
    }
  }

  @Test fun cameraReturnsAPrivateJpegFromEachLensAndSupportsCancel() {
    grant(Manifest.permission.CAMERA)
    val intent = Intent(context, CheckinCameraActivity::class.java)
    ActivityScenario.launchActivityForResult<CheckinCameraActivity>(intent).use { screen ->
      screen.onActivity { tap(it, "Cancel") }
      assertEquals(Activity.RESULT_CANCELED, screen.result.resultCode)
    }
    for (front in listOf(false, true)) {
      ActivityScenario.launchActivityForResult<CheckinCameraActivity>(intent).use { screen ->
        fun ready() {
          awaitState {
            var available = false
            screen.onActivity { a -> available = a.hasWindowFocus() && buttons(a.window.decorView).any { it.text == "Take photo" && it.isEnabled } }
            available
          }
        }
        ready()
        if (front) {
          screen.onActivity { a ->
            assertTrue(buttons(a.window.decorView).single { it.text == "Switch camera" }.isEnabled)
            tap(a, "Switch camera")
          }
          ready()
        }
        screen.onActivity { tap(it, "Take photo") }
        val result = screen.result
        assertEquals(Activity.RESULT_OK, result.resultCode)
        val bytes = Base64.decode(requireNotNull(result.resultData?.getStringExtra("jpeg")), Base64.NO_WRAP)
        assertTrue(bytes.size in 3..90000)
        assertEquals(255, bytes[0].toInt() and 255)
        assertEquals(216, bytes[1].toInt() and 255)
      }
    }
  }

  @Test fun recordingStopsOnBackgroundAndReturnsOnlyAfterConfirmation() {
    grant(Manifest.permission.RECORD_AUDIO)
    val intent = Intent(context, VoiceNoteActivity::class.java)
    ActivityScenario.launchActivityForResult<VoiceNoteActivity>(intent).use { screen ->
      screen.onActivity { tap(it, "Start recording") }
      SystemClock.sleep(1700)
      screen.moveToState(Lifecycle.State.CREATED)
      screen.moveToState(Lifecycle.State.RESUMED)
      screen.onActivity {
        assertFalse(buttons(it.window.decorView).any { b -> b.text == "Stop recording" })
        tap(it, "Use this recording")
      }
      assertEquals(Activity.RESULT_OK, screen.result.resultCode)
      val bytes = Base64.decode(requireNotNull(requireNotNull(screen.result.resultData).getStringExtra("audio")), Base64.DEFAULT)
      assertTrue(bytes.size in 12..180000)
      assertEquals("ftyp", String(bytes, 4, 4, Charsets.US_ASCII))
    }
  }

  @Test fun tripRunsWithVisibleStopActionAndEndsWhenTapped() {
    grant(Manifest.permission.ACCESS_COARSE_LOCATION)
    grant(Manifest.permission.ACCESS_FINE_LOCATION)
    if (Build.VERSION.SDK_INT >= 33) grant(Manifest.permission.POST_NOTIFICATIONS)
    val manager = requireNotNull(context.getSystemService(NotificationManager::class.java))
    val previous = TripService.receive
    TripService.receive = { _ -> }
    val trip = Intent(context, TripService::class.java).putExtra("scope", "test/child/device").putExtra("session", "testTrip")
    try {
      ActivityScenario.launch<VoiceNoteActivity>(Intent(context, VoiceNoteActivity::class.java)).use { screen ->
        screen.onActivity { activity ->
          assertTrue(TripService.visibleChannel(activity))
          activity.startForegroundService(trip)
        }
        awaitState { manager.activeNotifications.any { it.notification.channelId == "haven_shared_trip" } }
        assertEquals("test/child/device", TripService.activeScope)
        val notification = manager.activeNotifications.single { it.notification.channelId == "haven_shared_trip" }
        val stop = notification.notification.actions.single { it.title == "Stop sharing" }
        assertNotNull(stop.actionIntent)
        stop.actionIntent.send()
        awaitState { TripService.activeScope == null && manager.activeNotifications.none { it.id == notification.id } }
      }
    } finally {
      context.stopService(trip)
      TripService.receive = previous
    }
  }
}

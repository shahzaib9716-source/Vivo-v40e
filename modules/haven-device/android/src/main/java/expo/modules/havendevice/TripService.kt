package expo.modules.havendevice

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock

class TripService : Service(), LocationListener {
  companion object {
    private const val CHANNEL = "haven_shared_trip"
    private const val NOTIFICATION = 58120
    const val STOP = "haven.stop.trip"
    @Volatile var receive: ((Map<String, Any>) -> Unit)? = null
    @Volatile var activeScope: String? = null
      private set
    fun visibleChannel(ctx: Context): Boolean {
      val manager = ctx.getSystemService(NotificationManager::class.java) ?: return false
      if (!manager.areNotificationsEnabled()) return false
      if (Build.VERSION.SDK_INT < 26) return true
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Shared trips", NotificationManager.IMPORTANCE_DEFAULT))
      return manager.getNotificationChannel(CHANNEL).importance != NotificationManager.IMPORTANCE_NONE
    }
  }

  private val timer = Handler(Looper.getMainLooper())
  private var expiry = 0L
  private var lastSent = -60000L
  private var session = ""
  private var scope = ""
  private var threshold = 0
  private var status = ""
  private val manager get() = getSystemService(LocationManager::class.java)
  private val end = Runnable { stopSelf() }

  @Suppress("DEPRECATION")
  private fun notification(): Notification {
    val stop = PendingIntent.getService(this, NOTIFICATION, Intent(this, TripService::class.java).setAction(STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val open = packageManager.getLaunchIntentForPackage(packageName)
    if (open != null) builder.setContentIntent(PendingIntent.getActivity(this, NOTIFICATION, open, PendingIntent.FLAG_IMMUTABLE))
    return builder.setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Haven is sharing your trip")
      .setContentText("Your paired parent can see your route. Tap Stop to end sharing.")
      .setOnlyAlertOnce(true).setOngoing(true).setDeleteIntent(stop)
      .addAction(android.R.drawable.ic_delete, "Stop sharing", stop).build()
  }

  @Suppress("MissingPermission")
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null || intent.action == STOP) { stopSelf(); return START_NOT_STICKY }
    if (activeScope != null) return START_NOT_STICKY
    scope = intent.getStringExtra("scope") ?: ""
    session = intent.getStringExtra("session") ?: ""
    threshold = intent.getIntExtra("threshold", 0)
    if (scope.isEmpty() || session.isEmpty() || receive == null || !visibleChannel(this)) {
      stopSelf(); return START_NOT_STICKY
    }
    try {
      startForeground(NOTIFICATION, notification())
      val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val providers = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).filter {
        (it != LocationManager.GPS_PROVIDER || fine) && manager?.isProviderEnabled(it) == true
      }
      check(providers.isNotEmpty())
      activeScope = scope
      expiry = SystemClock.elapsedRealtime() + 30L * 60000
      timer.postDelayed(end, 30L * 60000)
      for (provider in providers) manager?.requestLocationUpdates(provider, 60000L, 0f, this, Looper.getMainLooper())
      publish("started")
    } catch (_: RuntimeException) { status = "Location is unavailable. Check location permission and providers."; stopSelf() }
    return START_NOT_STICKY
  }

  private fun publish(event: String, fields: Map<String, Any> = emptyMap()) {
    receive?.invoke(mapOf("event" to event, "scope" to scope, "session" to session, "message" to status) + fields)
  }

  override fun onLocationChanged(location: Location) {
    val now = SystemClock.elapsedRealtime()
    val notifications = getSystemService(NotificationManager::class.java)
    val shown = notifications?.activeNotifications?.any { it.id == NOTIFICATION } == true
    if (now >= expiry || receive == null || !shown || !visibleChannel(this)) { stopSelf(); return }
    val battery = getSystemService(android.os.BatteryManager::class.java)?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
    if (threshold > 0 && battery in 0 until threshold) { status = "Trip ended at the power-saving threshold."; stopSelf(); return }
    if (now - lastSent < 55000L || !location.hasAccuracy() || !location.accuracy.isFinite() ||
        location.accuracy !in 0f..100000f || now - location.elapsedRealtimeNanos / 1000000L !in 0L..120000L) return
    lastSent = now
    publish("fix", mapOf("latitude" to location.latitude, "longitude" to location.longitude,
      "accuracyM" to location.accuracy.toDouble(), "measuredAt" to location.time))
  }

  override fun onProviderEnabled(provider: String) {}
  override fun onProviderDisabled(provider: String) {}
  @Deprecated("Legacy Android callback")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onDestroy() {
    timer.removeCallbacksAndMessages(null)
    manager?.removeUpdates(this)
    activeScope = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    publish("stopped")
    super.onDestroy()
  }
}

package expo.modules.havendevice

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager

class HavenCallScreening : CallScreeningService() {
  override fun onScreenCall(details: Call.Details) {
    val incoming = Build.VERSION.SDK_INT >= 29 && details.callDirection == Call.Details.DIRECTION_INCOMING
    val enabled = getSharedPreferences("haven-call-screening", Context.MODE_PRIVATE).getBoolean("enabled", false)
    val contactsExcluded = checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED
    val block = incoming && enabled && contactsExcluded && details.handlePresentation == TelecomManager.PRESENTATION_ALLOWED
    respondToCall(details, CallResponse.Builder().setDisallowCall(block).setRejectCall(block).build())
  }
}

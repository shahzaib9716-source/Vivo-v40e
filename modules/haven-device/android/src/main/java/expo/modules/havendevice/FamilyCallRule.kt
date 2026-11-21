package expo.modules.havendevice

import android.content.Context

object FamilyCallRule {
  private fun settings(ctx: Context) = ctx.getSharedPreferences("haven-call-screening", Context.MODE_PRIVATE)

  fun optedIn(ctx: Context, scope: String) = scope.isNotEmpty() && settings(ctx).getString("allowedScope", null) == scope

  fun consent(ctx: Context, scope: String, allow: Boolean) {
    require(scope.isNotEmpty())
    val edit = settings(ctx).edit()
    if (allow) edit.putString("allowedScope", scope) else edit.remove("allowedScope")
    check(edit.commit())
  }

  fun apply(ctx: Context, scope: String, block: Boolean?) {
    val edit = settings(ctx).edit()
    if (block == null || scope.isEmpty()) edit.remove("ruleScope").remove("familyBlock")
    else edit.putString("ruleScope", scope).putBoolean("familyBlock", block)
    check(edit.commit())
  }

  fun enabled(ctx: Context): Boolean {
    val prefs = settings(ctx)
    return if (optedIn(ctx, prefs.getString("ruleScope", null) ?: "") && prefs.contains("familyBlock"))
      prefs.getBoolean("familyBlock", false) else prefs.getBoolean("enabled", false)
  }
}

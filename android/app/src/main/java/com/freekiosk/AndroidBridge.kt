package com.freekiosk

import android.content.Context
import android.webkit.JavascriptInterface

/** JavaScript API exposed to every page loaded by FreeKiosk's embedded WebView. */
class AndroidBridge(context: Context) {
    private val applicationContext = context.applicationContext

    @JavascriptInterface
    fun getAndroidId(): String = DeviceIdentity.getMachineCode(applicationContext)
}

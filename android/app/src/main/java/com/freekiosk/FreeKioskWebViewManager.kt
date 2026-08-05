package com.freekiosk

import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper

/**
 * App-owned WebView manager which installs FreeKiosk's Android JavaScript API
 * before react-native-webview receives a source URL to load.
 */
class FreeKioskWebViewManager : RNCWebViewManager() {
    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): RNCWebViewWrapper {
        return super.createViewInstance(context).also { wrapper ->
            wrapper.webView.addJavascriptInterface(AndroidBridge(context), "Android")
        }
    }

    private companion object {
        const val REACT_CLASS = "FreeKioskWebView"
    }
}

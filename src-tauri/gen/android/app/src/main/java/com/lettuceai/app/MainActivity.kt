package com.lettuceai.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Make WebView transparent to reveal native camera view behind it
    val webView = findViewById<android.webkit.WebView>(id("webview"))
    webView?.setBackgroundColor(android.graphics.Color.TRANSPARENT)
  }
  
  private fun id(name: String): Int {
    return resources.getIdentifier(name, "id", packageName)
  }
}

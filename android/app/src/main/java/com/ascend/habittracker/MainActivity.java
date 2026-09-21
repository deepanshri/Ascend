package com.ascend.habittracker;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Ascend main activity — tunes the Capacitor WebView for max cache / GPU throughput
 * so React tab switches and Motion swipe gestures stay on the compositor path.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthSleepPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Force hardware-accelerated window compositing for the WebView surface.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        configureBridgeWebView();
        WidgetBridgePlugin.dispatchIntent(this, getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        // Re-assert WebView prefs after resume (some OEMs reset cache mode).
        configureBridgeWebView();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        WidgetBridgePlugin.dispatchIntent(this, intent);
    }

    private void configureBridgeWebView() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);

        WebSettings webSettings = webView.getSettings();
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setJavaScriptEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        // Deprecated but still honored on many WebView builds — prefer compositor priority.
        try {
            //noinspection deprecation
            webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        } catch (Throwable ignored) {
            // Older / stripped WebView stubs may omit this API.
        }
    }
}

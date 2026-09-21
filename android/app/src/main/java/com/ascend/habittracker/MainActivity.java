package com.ascend.habittracker;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Ascend main activity — tunes the Capacitor WebView for max cache / GPU throughput
 * so React tab switches and Motion swipe gestures stay on the compositor path.
 */
@SuppressWarnings("SetJavaScriptEnabled")
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

        enableHighRefreshRate();
        configureBridgeWebView();
        WidgetBridgePlugin.dispatchIntent(this, getIntent());
    }

    @Override
    public void onStart() {
        super.onStart();
        enableHighRefreshRate();
        // Re-assert WebView prefs after resume (some OEMs reset cache mode).
        configureBridgeWebView();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        WidgetBridgePlugin.dispatchIntent(this, intent);
    }

    /**
     * Request the highest available display refresh rate (90/120Hz) so WebView
     * animations and Motion spring interpolations render at native cadence.
     */
    @SuppressWarnings("deprecation")
    private void enableHighRefreshRate() {
        try {
            // API 30+ (R): use Activity.getDisplay() — the modern path.
            // API 26–29 (minSdk=26): fall back to the deprecated getDefaultDisplay().
            Display display;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                display = getDisplay();
            } else {
                display = getWindowManager().getDefaultDisplay();
            }
            if (display == null) return;

            Display.Mode[] modes = display.getSupportedModes();
            Display.Mode maxMode = null;
            for (Display.Mode mode : modes) {
                if (maxMode == null || mode.getRefreshRate() > maxMode.getRefreshRate()) {
                    maxMode = mode;
                }
            }
            if (maxMode != null && maxMode.getRefreshRate() > 60.0f) {
                WindowManager.LayoutParams params = getWindow().getAttributes();
                params.preferredDisplayModeId = maxMode.getModeId();
                getWindow().setAttributes(params);
            }
        } catch (Throwable ignored) {
            // Guard against OEM-specific quirks where display APIs throw.
        }
    }

    @SuppressWarnings("deprecation")
    private void configureBridgeWebView() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (webView == null) return;

        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        WebSettings webSettings = webView.getSettings();
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setDomStorageEnabled(true);
        // setDatabaseEnabled() is deprecated; setDomStorageEnabled(true) above
        // already covers DOM/Web SQL storage in modern WebView builds.
        webSettings.setJavaScriptEnabled(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        // Deprecated but still honored on many WebView builds — prefer compositor priority.
        try {
            webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        } catch (Throwable ignored) {
            // Older / stripped WebView stubs may omit this API.
        }
    }
}

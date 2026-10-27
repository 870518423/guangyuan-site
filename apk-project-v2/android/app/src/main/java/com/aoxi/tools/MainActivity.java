package com.aoxi.tools;

import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import java.util.Collections;

public class MainActivity extends BridgeActivity {

    private static final long EXIT_WINDOW_MS = 2200L;
    private static final long SWIPE_MAX_MS = 1200L;
    private static final float SWIPE_EDGE_DP = 40f;
    private static final float SWIPE_MIN_DP = 48f;
    private static final float SWIPE_RATIO = 1.35f;
    private static final float SWIPE_VERTICAL_CANCEL_DP = 40f;

    private long lastHomeBackAt = 0L;
    private boolean backRequestPending = false;

    private boolean trackingSwipe = false;
    private boolean multiTouch = false;
    private float downX = 0f;
    private float downY = 0f;
    private float swipeMaxDx = 0f;
    private long downAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                requestBack(false);
            }
        });

        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) {
            webView.addJavascriptInterface(new NativeAppBridge(installedVersionName()), "AKNativeApp");
        }
        setupSystemGestureExclusion();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        boolean shouldSwipeBack = observeSwipeGesture(event);
        boolean handled = super.dispatchTouchEvent(event);
        if (shouldSwipeBack) requestBack(true);
        return handled;
    }

    private void requestBack(boolean fromSwipe) {
        if (backRequestPending) return;

        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) {
            finish();
            return;
        }

        backRequestPending = true;
        String js = "(function(){try{return !!(window.AkAppBack&&window.AkAppBack());}catch(e){return false;}})()";
        try {
            webView.evaluateJavascript(js, value -> {
                backRequestPending = false;
                if ("true".equals(value == null ? "" : value.trim())) return;
                performWebBack(webView, fromSwipe);
            });
        } catch (RuntimeException e) {
            backRequestPending = false;
            performWebBack(webView, fromSwipe);
        }
    }

    private void performWebBack(WebView webView, boolean fromSwipe) {
        String currentUrl = webView.getUrl();
        if (isHomeUrl(currentUrl)) {
            handleHomeBack(fromSwipe);
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        Uri uri = currentUrl == null ? null : Uri.parse(currentUrl);
        String origin = uri == null || uri.getAuthority() == null
            ? "https://localhost"
            : uri.getScheme() + "://" + uri.getAuthority();
        webView.loadUrl(origin + "/index.html");
    }

    private boolean isHomeUrl(String url) {
        if (url == null) return false;
        String path = Uri.parse(url).getPath();
        return path == null || path.isEmpty() || "/".equals(path) || "/index.html".equals(path);
    }

    private void handleHomeBack(boolean fromSwipe) {
        long now = SystemClock.elapsedRealtime();
        if (lastHomeBackAt > 0L && now - lastHomeBackAt <= EXIT_WINDOW_MS) {
            lastHomeBackAt = 0L;
            moveTaskToBack(true);
            return;
        }

        lastHomeBackAt = now;
        String msg = fromSwipe ? "\u518d\u6ed1\u4e00\u6b21\u8fd4\u56de\u684c\u9762" : "\u518d\u6309\u4e00\u6b21\u8fd4\u56de\u684c\u9762";
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    /** Activity 级触摸观察比 WebView 监听更可靠，系统手势导航也不会把整段事件吞掉。 */
    private boolean observeSwipeGesture(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                trackingSwipe = event.getX() <= dp(SWIPE_EDGE_DP);
                multiTouch = false;
                downX = event.getX();
                downY = event.getY();
                swipeMaxDx = 0f;
                downAt = SystemClock.elapsedRealtime();
                return false;

            case MotionEvent.ACTION_POINTER_DOWN:
                multiTouch = true;
                return false;

            case MotionEvent.ACTION_MOVE:
                if (trackingSwipe) {
                    float dx = event.getX() - downX;
                    float dy = Math.abs(event.getY() - downY);
                    swipeMaxDx = Math.max(swipeMaxDx, dx);
                    if (dy > dp(SWIPE_VERTICAL_CANCEL_DP) && dy > Math.abs(dx) * 1.2f) {
                        trackingSwipe = false;
                    }
                }
                return false;

            case MotionEvent.ACTION_UP:
                float dy = Math.abs(event.getY() - downY);
                long elapsed = SystemClock.elapsedRealtime() - downAt;
                boolean shouldGoBack = trackingSwipe
                    && !multiTouch
                    && swipeMaxDx >= dp(SWIPE_MIN_DP)
                    && swipeMaxDx > dy * SWIPE_RATIO
                    && elapsed <= SWIPE_MAX_MS;
                resetSwipe();
                return shouldGoBack;

            case MotionEvent.ACTION_CANCEL:
                resetSwipe();
                return false;

            default:
                return false;
        }
    }

    private void resetSwipe() {
        trackingSwipe = false;
        multiTouch = false;
        swipeMaxDx = 0f;
    }

    private void setupSystemGestureExclusion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;

        View decor = getWindow().getDecorView();
        decor.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
            updateSystemGestureExclusion()
        );
        decor.post(this::updateSystemGestureExclusion);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) getWindow().getDecorView().post(this::updateSystemGestureExclusion);
    }

    private void updateSystemGestureExclusion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        View decor = getWindow().getDecorView();
        int height = decor.getHeight();
        if (height <= 0) return;
        int edge = Math.max(1, dp(SWIPE_EDGE_DP));
        decor.setSystemGestureExclusionRects(Collections.singletonList(new Rect(0, 0, edge, height)));
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /** 从系统读取已安装包的 versionName，避免依赖可能未生成的 BuildConfig。 */
    private String installedVersionName() {
        try {
            PackageManager pm = getPackageManager();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                return pm.getPackageInfo(getPackageName(), PackageManager.PackageInfoFlags.of(0)).versionName;
            }
            return pm.getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    /** 只向网页暴露安装包的真实 versionName，不暴露其他原生能力。 */
    private static final class NativeAppBridge {
        private final String versionName;

        NativeAppBridge(String versionName) {
            this.versionName = versionName == null ? "" : versionName;
        }

        @JavascriptInterface
        public String getVersionName() {
            return versionName;
        }
    }
}

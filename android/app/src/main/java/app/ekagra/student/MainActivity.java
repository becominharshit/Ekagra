package app.ekagra.student;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import app.ekagra.student.files.FileSaverPlugin;
import app.ekagra.student.focusguard.FocusGuardPlugin;
import app.ekagra.student.health.HealthBridgePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Health Connect's "Why does this app need access?" link (Android 9–13, and 14+). */
    private static final String HEALTH_RATIONALE = "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE";
    private static final String HEALTH_PERMISSION_USAGE = "android.intent.action.VIEW_PERMISSION_USAGE";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own Kotlin plugins (app blocking, saving the data export, Health Connect); plugins from npm are registered by Capacitor itself.
        registerPlugin(FocusGuardPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(HealthBridgePlugin.class);
        rewriteShareIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    /** Also gets the intent the app was opened with. Health Connect's privacy link opens the privacy page; Android Share opens the Library. */
    @Override
    protected void onNewIntent(Intent intent) {
        rewriteShareIntent(intent);
        super.onNewIntent(intent);
        String action = intent == null ? null : intent.getAction();
        if (bridge != null && (HEALTH_RATIONALE.equals(action) || HEALTH_PERMISSION_USAGE.equals(action))) {
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(bridge.getLocalUrl() + "/privacy"));
        }
    }

    /** Turns a shared YouTube link or text (ACTION_SEND) into an ekagra://share?text=… link that useNativeLinks() opens in the Library. */
    private void rewriteShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null || shared.trim().isEmpty()) return;
        Uri uri = new Uri.Builder()
            .scheme("ekagra")
            .authority("share")
            .appendQueryParameter("text", shared.trim())
            .build();
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(uri);
    }
}


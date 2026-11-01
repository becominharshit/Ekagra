package app.ekagra.student;

import android.os.Bundle;
import app.ekagra.student.files.FileSaverPlugin;
import app.ekagra.student.focusguard.FocusGuardPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own Kotlin plugins (app blocking, saving the data export); plugins from npm are registered by Capacitor itself.
        registerPlugin(FocusGuardPlugin.class);
        registerPlugin(FileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

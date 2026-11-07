package app.ekagra.student.files

import android.app.Activity
import android.content.Intent
import android.util.Base64
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException

/**
 * Saves a file the app made (Me → Account and privacy → Export all data) where the student picks.
 * The app's WebView can't download files like a browser, so this opens Android's own "Save to"
 * screen (ACTION_CREATE_DOCUMENT: Downloads, Drive, …) and writes the file there. No storage
 * permission is needed: Android lets the app write only the one file the student just created.
 * The web app calls it through src/lib/native/fileSaver.ts.
 */
@CapacitorPlugin(name = "FileSaver")
class FileSaverPlugin : Plugin() {

    /** Asks where to save { name, mimeType, data }; resolves { saved: false } if the student goes back. */
    @PluginMethod
    fun save(call: PluginCall) {
        val name = call.getString("name")
        if (name.isNullOrBlank() || call.getString("data") == null) {
            call.reject("A file name and data are needed.")
            return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mimeType") ?: "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, name)
        }
        startActivityForResult(call, intent, "onPlacePicked")
    }

    @ActivityCallback
    private fun onPlacePicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("saved", false))
            return
        }
        val data = call.getString("data") ?: ""
        // A PDF comes as base64 and must be written byte for byte; text as UTF-8.
        val bytes = if (call.getString("encoding") == "base64") Base64.decode(data, Base64.DEFAULT) else data.toByteArray(Charsets.UTF_8)
        // A big export takes a moment to write: not on the screen's thread.
        Thread {
            try {
                val stream = context.contentResolver.openOutputStream(uri) ?: throw IOException("The file couldn't be opened.")
                stream.use { it.write(bytes) }
                call.resolve(JSObject().put("saved", true).put("uri", uri.toString()))
            } catch (error: Exception) {
                call.reject("The file couldn't be saved: ${error.message}", error)
            }
        }.start()
    }
}

package com.trails.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

data class UpdateInfo(val versionName: String, val releaseNotes: String, val apkUrl: String)

/**
 * In-app OTA updater -- same pattern as github.com/Karlmit/Boet's updater:
 * GitHub's public Releases API + a plain, unauthenticated OkHttp client
 * (deliberately NOT the Trails-API Bearer client from NetworkModule --
 * sending that Authorization header to api.github.com would look like a
 * malformed token and get a 401) + FileProvider + `ACTION_VIEW` handing off
 * to the system package installer. Every build type is signed with the same
 * key (app/build.gradle.kts's shared signingConfig) specifically so an
 * update always installs cleanly over whatever's already on the device --
 * Android refuses an install signed with a different certificate.
 */
@Singleton
class UpdateChecker @Inject constructor(@ApplicationContext private val context: Context) {

    private val http = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    /** Null if up to date, offline, or the check failed for any reason -- never throws. */
    suspend fun check(): UpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder()
                .url(RELEASES_API)
                .header("Accept", "application/vnd.github+json")
                .build()
            val release = http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                json.decodeFromString(GitHubRelease.serializer(), response.body?.string().orEmpty())
            }
            val apkAsset = release.assets.firstOrNull { it.name.endsWith(".apk", ignoreCase = true) }
                ?: return@withContext null
            val remoteVersion = versionFromTag(release.tagName) ?: return@withContext null
            val installedVersion = currentVersion() ?: return@withContext null
            if (isNewer(remoteVersion, installedVersion)) {
                UpdateInfo(remoteVersion, release.body.trim(), apkAsset.browserDownloadUrl)
            } else {
                null
            }
        }.getOrNull()
    }

    /** True if already permitted; otherwise sends the user to the OS "install unknown apps" settings screen and returns false. */
    fun ensureCanInstall(): Boolean {
        if (context.packageManager.canRequestPackageInstalls()) return true
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
        return false
    }

    /** Downloads [info]'s APK and hands it to the system installer. Call [ensureCanInstall] first. */
    suspend fun downloadAndInstall(info: UpdateInfo) {
        val file = withContext(Dispatchers.IO) {
            val dir = File(context.cacheDir, "updates").apply { mkdirs() }
            val out = File(dir, "trails-${info.versionName}.apk")
            val request = Request.Builder().url(info.apkUrl).build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw RuntimeException("Download failed: HTTP ${response.code}")
                val body = response.body ?: throw RuntimeException("Empty download")
                out.outputStream().use { stream -> body.byteStream().copyTo(stream) }
            }
            out
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun currentVersion(): String? = runCatching {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull()

    companion object {
        // Tag convention is "android-v<versionName>" (e.g. "android-v0.1.0"),
        // deliberately not a bare "v*" tag -- the web app's own release flow
        // (.github/workflows/docker-publish.yml) already triggers off "v*"
        // tags, and this must not collide with it. The regex below doesn't
        // actually care about the prefix, only the dotted version inside it.
        private const val RELEASES_API = "https://api.github.com/repos/Karlmit/Trails/releases/latest"
        private val VERSION_REGEX = Regex("""\d+(?:\.\d+)+""")

        fun versionFromTag(tag: String): String? = VERSION_REGEX.find(tag)?.value

        /** True only if [remote] is a strictly higher dotted version than [installed]. */
        fun isNewer(remote: String, installed: String): Boolean {
            val remoteParts = remote.split(".").map { it.toIntOrNull() ?: 0 }
            val installedParts = installed.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(remoteParts.size, installedParts.size)) {
                val r = remoteParts.getOrElse(i) { 0 }
                val c = installedParts.getOrElse(i) { 0 }
                if (r != c) return r > c
            }
            return false
        }
    }
}

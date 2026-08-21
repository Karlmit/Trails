package com.trails.app.update

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Just enough of GitHub's "get the latest release" response shape
// (GET /repos/{owner}/{repo}/releases/latest) to find an APK asset and the
// version it represents -- see UpdateChecker.
@Serializable
data class GitHubRelease(
    @SerialName("tag_name") val tagName: String,
    val body: String = "",
    val assets: List<GitHubAsset> = emptyList(),
)

@Serializable
data class GitHubAsset(
    val name: String,
    @SerialName("browser_download_url") val browserDownloadUrl: String,
)

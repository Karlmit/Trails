# Releases

When making a project update, publish a new version through the applicable release workflow and verify that it is available before calling the update complete.

For Android updates, increment `versionCode` and `versionName` in `android/app/build.gradle.kts`, push the release commit to `main`, and verify that the Android release workflow published the signed APK on GitHub Releases.

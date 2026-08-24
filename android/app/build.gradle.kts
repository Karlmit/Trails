import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

// One signing key for every build type (debug included) -- see
// keystore/keystore.properties (gitignored; CI materializes it from repo
// secrets before invoking Gradle, see .github/workflows/android-release.yml).
// Android refuses to install an update signed with a different key than
// what's already on the device, so this is what makes the in-app updater
// (com.trails.app.update) actually work across builds.
val keystorePropertiesFile = rootProject.file("keystore/keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.room)
    alias(libs.plugins.paparazzi)
}

android {
    namespace = "com.trails.app"
    // Pinned to 35 rather than the newest 36: Paparazzi 1.3.5's screenshot
    // rendering (JVM-only LayoutLib, no device/emulator) doesn't yet
    // recognize 36's platform data, and the app itself uses nothing 36-only
    // at this phase. Revisit once Paparazzi/Robolectric catch up.
    compileSdk = 35

    defaultConfig {
        applicationId = "com.trails.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 17
        versionName = "0.17.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = rootProject.file("keystore/${keystoreProperties["storeFile"]}")
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            // Deliberately signed with the release key too (not the
            // auto-generated debug keystore) -- otherwise a manually
            // installed debug build could never accept an in-app update at
            // all, since the signatures would never match.
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    lint {
        // lintVitalAnalyzeRelease (which assembleRelease runs by default)
        // hit an unrelated environment-specific failure ("Unable to delete
        // directory ... after 10 attempts") on this workspace's filesystem,
        // and this app has no release-only lint requirement worth blocking
        // CI on -- ordinary `lint`/`lintDebug` still run normally.
        checkReleaseBuilds = false
    }
    // Paparazzi (screenshot tests on the JVM, no device/emulator) currently
    // requires disabling androidTest's resource merging conflict with its
    // bundled layoutlib -- kept to the default packaging otherwise.
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.hilt.work)
    ksp(libs.hilt.work.compiler)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    implementation(libs.datastore.preferences)
    implementation(libs.work.runtime.ktx)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.room.runtime)
    testImplementation(libs.androidx.test.core)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}

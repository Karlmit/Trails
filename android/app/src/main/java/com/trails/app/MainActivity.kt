package com.trails.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.trails.app.ui.nav.TrailsNavHost
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsTheme
import com.trails.app.update.UpdatePrompt
import dagger.hilt.android.AndroidEntryPoint

// Multi-language support: AppCompatActivity (not plain ComponentActivity) is
// required for AppCompatDelegate.setApplicationLocales' automatic
// locale-persistence and automatic activity-recreate-on-change (see
// ui/settings/SettingsViewModel.kt) -- AppCompatActivity still extends
// ComponentActivity, so enableEdgeToEdge()/setContent{} below are unchanged.
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TrailsTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = TrailsColors.Canvas) {
                    TrailsNavHost()
                }
                // Sibling to the nav host, not inside it -- an update
                // prompt should be able to surface over any screen.
                UpdatePrompt()
            }
        }
    }
}

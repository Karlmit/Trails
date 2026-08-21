package com.trails.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.trails.app.ui.nav.TrailsNavHost
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsTheme
import com.trails.app.update.UpdatePrompt
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
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

package com.trails.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors

/**
 * An empty list screen is "an invitation to act," not a dead end -- swaps
 * every screen's old plain "No X yet." caption for a big friendly emoji plus
 * a short, specific line of what to do next. Small, cheap, and the single
 * highest-visibility "this app has personality" moment on a fresh Trip.
 */
@Composable
fun EmptyState(emoji: String, message: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(emoji, style = MaterialTheme.typography.displayMedium)
        Text(
            message,
            style = MaterialTheme.typography.bodyLarge,
            color = TrailsColors.TextSoft,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 12.dp),
        )
    }
}

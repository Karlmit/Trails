package com.trails.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.theme.TrailsShapes

/**
 * Mirrors globals.css's `.card` -- a white, 12dp-radius, whisper-soft-shadow
 * surface. User-reported the Android edit screens looked "half-arsed"
 * against this design system: every list screen (Checklists/Budget/Trips)
 * already groups its content in a card like this, but every create/edit
 * form instead rendered its fields as a bare `Column` straight on the cream
 * canvas -- the single biggest gap between "looks designed" and "looks like
 * an unstyled form." This is the fix, reused everywhere a form or detail
 * screen needs one.
 */
@Composable
fun TrailsCard(
    modifier: Modifier = Modifier,
    verticalArrangement: Arrangement.Vertical = Arrangement.spacedBy(14.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        shape = TrailsShapes.Card,
        colors = CardDefaults.elevatedCardColors(containerColor = TrailsColors.Surface),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = verticalArrangement,
            content = content,
        )
    }
}

/**
 * A small colored circular badge (an emoji, matching this app's existing
 * "📖 Blog Post" convention) paired with a title -- the signature "fun but
 * still a real app" touch this redesign leans on, reused across every
 * screen instead of inventing a different flourish per screen (per the
 * design brief: spend the boldness once, keep everything else quiet).
 */
@Composable
fun ScreenHeading(
    emoji: String,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(
            shape = TrailsShapes.Card,
            color = TrailsColors.BrandMint,
            modifier = Modifier.size(44.dp),
        ) {
            androidx.compose.foundation.layout.Box(contentAlignment = Alignment.Center) {
                Text(emoji, style = MaterialTheme.typography.titleLarge)
            }
        }
        Column(modifier = Modifier.padding(start = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = TrailsColors.Brand)
            subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = TrailsColors.TextSoft)
            }
        }
    }
}

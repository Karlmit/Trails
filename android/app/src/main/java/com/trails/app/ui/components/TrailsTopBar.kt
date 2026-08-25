package com.trails.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.trails.app.R
import com.trails.app.ui.theme.TrailsColors

/**
 * Mirrors globals.css's `.top-nav` -- white surface, the logo + wordmark
 * brand mark in the same spot TopNav.tsx puts it. The web's hamburger/
 * hide-on-scroll behavior isn't reproduced here (Compose screens don't
 * have that horizontal-overflow problem in the first place), just the look.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrailsTopBar(title: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(R.drawable.trails_logo),
                    contentDescription = null,
                    modifier = Modifier.size(28.dp).padding(end = 8.dp),
                )
                Text(
                    text = title ?: "Trails",
                    style = MaterialTheme.typography.titleMedium,
                    color = TrailsColors.Brand,
                )
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = TrailsColors.Surface,
            titleContentColor = TrailsColors.Brand,
        ),
    )
}

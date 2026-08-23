package com.trails.app.ui.components

import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * User-requested: a way to force a fresh sync from any page without
 * restarting the app ("drag down to refresh"). Thin wrapper around
 * Material3's own pull-to-refresh so every trip-content screen gets the
 * same gesture with one call, backed by [com.trails.app.sync.TripRefresher]
 * on the ViewModel side.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PullToRefreshScreen(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        content = content,
    )
}

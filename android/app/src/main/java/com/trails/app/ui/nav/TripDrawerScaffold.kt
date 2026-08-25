package com.trails.app.ui.nav

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import com.trails.app.R
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import kotlinx.coroutines.launch

private const val ROUTE_TRIPS = "trips"
private const val ROUTE_SETTINGS = "settings"

/**
 * Mirrors TripTabs.tsx's mobile hamburger-drawer collapse -- one drawer
 * listing all 9 tabs, plus Travel Mode as a standalone item shown only
 * while the Trip is ACTIVE, plus a "Trips" item back to the trip list.
 *
 * [showBackButton]: sub-screens reached by tapping something (Entry/Blog
 * detail), not by picking a tab, get a plain back arrow instead of the
 * hamburger -- popping one entry is the right action there, not opening
 * the drawer.
 *
 * User-requested: while inside a Trip, the system back button/gesture
 * must always return to Timeline (never straight to the trip list) --
 * "All Trips" is reached only by deliberately tapping that drawer item.
 * Tab navigation (navigateTo's popUpTo) always collapses the backstack
 * down to [timeline, currentTab] rather than [trips, currentTab], and
 * TrailsNavHost's onOpenTrip pops "trips" off entirely once Timeline is
 * first shown, so Timeline sits at the bottom of every Trip-scoped
 * backstack with nothing below it to fall back to.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TripDrawerScaffold(
    tripId: String,
    currentTab: TripTab?,
    title: String,
    navController: NavHostController,
    showBackButton: Boolean = false,
    floatingActionButton: @Composable () -> Unit = {},
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    val shellViewModel: TripShellViewModel = hiltViewModel()
    val trip by shellViewModel.trip.collectAsState()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    val timelineRoute = "trip/$tripId/${TripTab.TIMELINE.route}"

    fun navigateTo(route: String) {
        scope.launch { drawerState.close() }
        navController.navigate("trip/$tripId/$route") {
            popUpTo(timelineRoute) { inclusive = route == TripTab.TIMELINE.route }
            launchSingleTop = true
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                trip?.let { t ->
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            t.name,
                            style = MaterialTheme.typography.titleMedium,
                            color = TrailsColors.Brand,
                            modifier = Modifier.weight(1f),
                        )
                        TripStatusBadge(t.status)
                    }
                    HorizontalDivider()
                }
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.shell_drawer_all_trips)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        // The only deliberate escape hatch back to the trip
                        // list -- Timeline is always present below whatever
                        // screen this drawer was opened from (see class doc),
                        // so popping up to it before pushing "trips" clears
                        // this Trip's entire backstack rather than leaving it
                        // dangling underneath.
                        navController.navigate(ROUTE_TRIPS) { popUpTo(timelineRoute) { inclusive = true } }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                )
                HorizontalDivider()
                TripTab.entries.forEach { tab ->
                    NavigationDrawerItem(
                        label = { Text(tab.label) },
                        selected = tab == currentTab,
                        onClick = { navigateTo(tab.route) },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                    )
                }
                if (trip?.status == "ACTIVE") {
                    HorizontalDivider()
                    NavigationDrawerItem(
                        label = { Text(stringResource(R.string.shell_travel_mode)) },
                        selected = false,
                        onClick = { navigateTo("travel-mode") },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                    )
                }
                HorizontalDivider()
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.drawer_settings)) },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(ROUTE_SETTINGS)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                )
            }
        },
    ) {
        Scaffold(
            containerColor = TrailsColors.Canvas,
            topBar = {
                TopAppBar(
                    title = { Text(title, color = TrailsColors.Brand, style = MaterialTheme.typography.titleMedium) },
                    navigationIcon = {
                        IconButton(
                            onClick = {
                                if (showBackButton) navController.popBackStack()
                                else scope.launch { drawerState.open() }
                            },
                        ) {
                            Icon(
                                if (showBackButton) Icons.AutoMirrored.Filled.ArrowBack else Icons.Filled.Menu,
                                contentDescription = if (showBackButton) stringResource(R.string.shell_cd_back) else stringResource(R.string.shell_cd_menu),
                                tint = TrailsColors.Brand,
                            )
                        }
                    },
                    actions = actions,
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = TrailsColors.Surface),
                )
            },
            floatingActionButton = floatingActionButton,
        ) { padding -> content(padding) }
    }
}

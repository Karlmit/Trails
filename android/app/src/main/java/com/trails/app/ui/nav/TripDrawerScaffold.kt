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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import com.trails.app.ui.components.TripStatusBadge
import com.trails.app.ui.theme.TrailsColors
import kotlinx.coroutines.launch

private const val ROUTE_TRIPS = "trips"

/**
 * Mirrors TripTabs.tsx's mobile hamburger-drawer collapse -- one drawer
 * listing all 9 tabs, plus Travel Mode as a standalone item shown only
 * while the Trip is ACTIVE, plus a "Trips" item back to the trip list.
 *
 * [showBackButton]: sub-screens reached by tapping something (Entry/Blog
 * detail), not by picking a tab, get a plain back arrow instead of the
 * hamburger -- popping one entry is the right action there, not opening
 * the drawer. Tab navigation itself always collapses the backstack to
 * [trips, currentTab] (see navigateTo's popUpTo) so switching tabs never
 * grows an unbounded stack, and the system back button/gesture reliably
 * returns to the trip list from any tab in exactly one press.
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
    content: @Composable (PaddingValues) -> Unit,
) {
    val shellViewModel: TripShellViewModel = hiltViewModel()
    val trip by shellViewModel.trip.collectAsState()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    fun navigateTo(route: String) {
        scope.launch { drawerState.close() }
        navController.navigate("trip/$tripId/$route") {
            popUpTo(ROUTE_TRIPS) { inclusive = false }
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
                    label = { Text("← All Trips") },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(ROUTE_TRIPS) { popUpTo(ROUTE_TRIPS) { inclusive = true } }
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
                        label = { Text("Travel Mode") },
                        selected = false,
                        onClick = { navigateTo("travel-mode") },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                    )
                }
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
                                contentDescription = if (showBackButton) "Back" else "Menu",
                                tint = TrailsColors.Brand,
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = TrailsColors.Surface),
                )
            },
            floatingActionButton = floatingActionButton,
        ) { padding -> content(padding) }
    }
}

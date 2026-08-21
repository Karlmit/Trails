package com.trails.app.ui.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.trails.app.ui.login.LoginScreen
import com.trails.app.ui.timeline.TimelineScreen
import com.trails.app.ui.triplist.TripListScreen

private const val ROUTE_LOGIN = "login"
private const val ROUTE_TRIPS = "trips"
private const val ROUTE_TIMELINE = "timeline/{tripId}"
private const val ARG_TRIP_ID = "tripId"

private fun timelineRoute(tripId: String) = "timeline/$tripId"

@Composable
fun TrailsNavHost(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = ROUTE_LOGIN) {
        composable(ROUTE_LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(ROUTE_TRIPS) {
                        popUpTo(ROUTE_LOGIN) { inclusive = true }
                    }
                },
            )
        }
        composable(ROUTE_TRIPS) {
            TripListScreen(onOpenTrip = { tripId -> navController.navigate(timelineRoute(tripId)) })
        }
        composable(
            route = ROUTE_TIMELINE,
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) {
            // TimelineViewModel reads "tripId" straight out of the
            // SavedStateHandle Hilt Navigation Compose wires up from this
            // route's own arguments -- no need to thread it through here.
            TimelineScreen()
        }
    }
}

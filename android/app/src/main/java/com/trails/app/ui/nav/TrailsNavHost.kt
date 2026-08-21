package com.trails.app.ui.nav

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.trails.app.ui.blog.BlogDetailScreen
import com.trails.app.ui.blog.BlogListScreen
import com.trails.app.ui.budget.BudgetScreen
import com.trails.app.ui.checklists.ChecklistsScreen
import com.trails.app.ui.documents.DocumentsScreen
import com.trails.app.ui.entrydetail.EntryDetailScreen
import com.trails.app.ui.ideas.IdeasScreen
import com.trails.app.ui.importantinfo.ImportantInfoScreen
import com.trails.app.ui.login.LoginScreen
import com.trails.app.ui.overview.OverviewScreen
import com.trails.app.ui.sections.SectionsScreen
import com.trails.app.ui.timeline.TimelineScreen
import com.trails.app.ui.travelmode.TravelModeScreen
import com.trails.app.ui.triplist.TripListScreen

private const val ROUTE_LOGIN = "login"
private const val ROUTE_TRIPS = "trips"
private const val ARG_TRIP_ID = "tripId"
private const val ARG_ENTRY_ID = "entryId"

private fun tripRoute(tripId: String, tab: String) = "trip/$tripId/$tab"
private fun entryDetailRoute(tripId: String, entryId: String) = "trip/$tripId/entries/$entryId"
private fun blogDetailRoute(tripId: String, entryId: String) = "trip/$tripId/blog/$entryId"

@Composable
fun TrailsNavHost(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = ROUTE_LOGIN) {
        composable(ROUTE_LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(ROUTE_TRIPS) { popUpTo(ROUTE_LOGIN) { inclusive = true } }
                },
            )
        }
        composable(ROUTE_TRIPS) {
            TripListScreen(onOpenTrip = { tripId -> navController.navigate(tripRoute(tripId, TripTab.TIMELINE.route)) })
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.TIMELINE.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.TIMELINE, "Timeline", navController) { padding ->
                TimelineScreen(padding, onOpenEntry = { entryType, entryId ->
                    val route = if (entryType == "BLOG_POST") blogDetailRoute(tripId, entryId) else entryDetailRoute(tripId, entryId)
                    navController.navigate(route)
                })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.SECTIONS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.SECTIONS, "Sections", navController) { padding -> SectionsScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IDEAS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.IDEAS, "Ideas", navController) { padding -> IdeasScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.CHECKLISTS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.CHECKLISTS, "Checklists", navController) { padding -> ChecklistsScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IMPORTANT_INFO.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.IMPORTANT_INFO, "Important Info", navController) { padding -> ImportantInfoScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.BLOG.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.BLOG, "Blog", navController) { padding ->
                BlogListScreen(padding, onOpenPost = { entryId -> navController.navigate(blogDetailRoute(tripId, entryId)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.BUDGET.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.BUDGET, "Budget", navController) { padding ->
                BudgetScreen(padding, onOpenEntry = { _, entryId -> navController.navigate(entryDetailRoute(tripId, entryId)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.DOCUMENTS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.DOCUMENTS, "Documents", navController) { padding -> DocumentsScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.OVERVIEW.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.OVERVIEW, "Overview", navController) { padding -> OverviewScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/travel-mode",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, null, "Travel Mode", navController) { padding ->
                TravelModeScreen(padding, onOpenEntry = { _, entryId -> navController.navigate(entryDetailRoute(tripId, entryId)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/entries/{$ARG_ENTRY_ID}",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_ENTRY_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.TIMELINE, "Entry", navController, showBackButton = true) { padding ->
                EntryDetailScreen(padding)
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/blog/{$ARG_ENTRY_ID}",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_ENTRY_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.BLOG, "Blog post", navController, showBackButton = true) { padding ->
                BlogDetailScreen(padding)
            }
        }
    }
}

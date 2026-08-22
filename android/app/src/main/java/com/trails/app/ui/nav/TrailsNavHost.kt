package com.trails.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.trails.app.ui.blog.BlogDetailScreen
import com.trails.app.ui.blog.BlogEditScreen
import com.trails.app.ui.blog.BlogListScreen
import com.trails.app.ui.budget.BudgetScreen
import com.trails.app.ui.checklists.ChecklistEditScreen
import com.trails.app.ui.checklists.ChecklistsScreen
import com.trails.app.ui.documents.DocumentsScreen
import com.trails.app.ui.entrydetail.EntryDetailScreen
import com.trails.app.ui.entrydetail.EntryEditScreen
import com.trails.app.ui.ideas.IdeaEditScreen
import com.trails.app.ui.ideas.IdeasScreen
import com.trails.app.ui.importantinfo.ImportantInfoEditScreen
import com.trails.app.ui.importantinfo.ImportantInfoScreen
import com.trails.app.ui.login.LoginScreen
import com.trails.app.ui.overview.OverviewScreen
import com.trails.app.ui.overview.TripEditScreen
import com.trails.app.ui.sections.SectionEditScreen
import com.trails.app.ui.sections.SectionsScreen
import com.trails.app.ui.timeline.TimelineScreen
import com.trails.app.ui.travelmode.TravelModeScreen
import com.trails.app.ui.triplist.TripListScreen

private const val ROUTE_LOGIN = "login"
private const val ROUTE_TRIPS = "trips"
private const val ARG_TRIP_ID = "tripId"
private const val ARG_ENTRY_ID = "entryId"
private const val ARG_SECTION_ID = "sectionId"
private const val ARG_CHECKLIST_ID = "checklistId"
private const val ARG_INFO_ID = "infoId"
private const val ARG_IDEA_ID = "ideaId"
private const val NEW_ID = "new"

private fun tripRoute(tripId: String, tab: String) = "trip/$tripId/$tab"
private fun entryDetailRoute(tripId: String, entryId: String) = "trip/$tripId/entries/$entryId"
private fun entryEditRoute(tripId: String, entryId: String?) = "trip/$tripId/entries/${entryId ?: NEW_ID}/edit"
private fun blogDetailRoute(tripId: String, entryId: String) = "trip/$tripId/blog/$entryId"
private fun blogEditRoute(tripId: String, entryId: String?) = "trip/$tripId/blog/${entryId ?: NEW_ID}/edit"
private fun sectionEditRoute(tripId: String, sectionId: String?) = "trip/$tripId/sections/${sectionId ?: NEW_ID}/edit"
private fun checklistEditRoute(tripId: String, checklistId: String?) = "trip/$tripId/checklists/${checklistId ?: NEW_ID}/edit"
private fun infoEditRoute(tripId: String, infoId: String?) = "trip/$tripId/important-info/${infoId ?: NEW_ID}/edit"
private fun ideaEditRoute(tripId: String, ideaId: String?) = "trip/$tripId/ideas/${ideaId ?: NEW_ID}/edit"

@Composable
private fun AddFab(onClick: () -> Unit) {
    FloatingActionButton(onClick = onClick) { Icon(Icons.Filled.Add, contentDescription = "Add") }
}

/** Timeline's own FAB offers a choice -- an Idea isn't scheduled yet, so it doesn't belong as a Timeline Entry until converted. */
@Composable
private fun AddEntryOrIdeaFab(onAddEntry: () -> Unit, onAddIdea: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        FloatingActionButton(onClick = { expanded = true }) { Icon(Icons.Filled.Add, contentDescription = "Add") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Entry") }, onClick = { expanded = false; onAddEntry() })
            DropdownMenuItem(text = { Text("Idea") }, onClick = { expanded = false; onAddIdea() })
        }
    }
}

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
            TripListScreen(
                onOpenTrip = { tripId -> navController.navigate(tripRoute(tripId, TripTab.TIMELINE.route)) },
                onAddTrip = { navController.navigate("trips/new/edit") },
            )
        }

        composable("trips/new/edit") {
            TripEditScreen(onDone = { navController.popBackStack() }, onBack = { navController.popBackStack() })
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/edit",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) {
            TripEditScreen(onDone = { navController.popBackStack() }, onBack = { navController.popBackStack() })
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.TIMELINE.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.TIMELINE, "Timeline", navController,
                floatingActionButton = {
                    AddEntryOrIdeaFab(
                        onAddEntry = { navController.navigate(entryEditRoute(tripId, null)) },
                        onAddIdea = { navController.navigate(ideaEditRoute(tripId, null)) },
                    )
                },
            ) { padding ->
                TimelineScreen(padding, onOpenEntry = { entryType, entryId ->
                    val route = if (entryType == "BLOG_POST") blogDetailRoute(tripId, entryId) else entryDetailRoute(tripId, entryId)
                    navController.navigate(route)
                })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/entries/{$ARG_ENTRY_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_ENTRY_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.TIMELINE, "Edit Entry", navController, showBackButton = true) { padding ->
                EntryEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.SECTIONS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.SECTIONS, "Sections", navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(sectionEditRoute(tripId, null)) }) },
            ) { padding ->
                SectionsScreen(padding, onOpenSection = { id -> navController.navigate(sectionEditRoute(tripId, id)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/sections/{$ARG_SECTION_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_SECTION_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.SECTIONS, "Edit Section", navController, showBackButton = true) { padding ->
                SectionEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IDEAS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.IDEAS, "Ideas", navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(ideaEditRoute(tripId, null)) }) },
            ) { padding ->
                IdeasScreen(padding, onOpenIdea = { id -> navController.navigate(ideaEditRoute(tripId, id)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/ideas/{$ARG_IDEA_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_IDEA_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.IDEAS, "Edit Idea", navController, showBackButton = true) { padding ->
                IdeaEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.CHECKLISTS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.CHECKLISTS, "Checklists", navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(checklistEditRoute(tripId, null)) }) },
            ) { padding ->
                ChecklistsScreen(padding, onOpenChecklist = { id -> navController.navigate(checklistEditRoute(tripId, id)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/checklists/{$ARG_CHECKLIST_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_CHECKLIST_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.CHECKLISTS, "Edit Checklist", navController, showBackButton = true) { padding ->
                ChecklistEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IMPORTANT_INFO.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.IMPORTANT_INFO, "Important Info", navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(infoEditRoute(tripId, null)) }) },
            ) { padding ->
                ImportantInfoScreen(padding, onOpenItem = { id -> navController.navigate(infoEditRoute(tripId, id)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/important-info/{$ARG_INFO_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_INFO_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.IMPORTANT_INFO, "Edit Important Info", navController, showBackButton = true) { padding ->
                ImportantInfoEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.BLOG.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.BLOG, "Blog", navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(blogEditRoute(tripId, null)) }) },
            ) { padding ->
                BlogListScreen(padding, onOpenPost = { entryId -> navController.navigate(blogDetailRoute(tripId, entryId)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/blog/{$ARG_ENTRY_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_ENTRY_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.BLOG, "Edit Blog Post", navController, showBackButton = true) { padding ->
                BlogEditScreen(padding, onDone = { navController.popBackStack() })
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
            TripDrawerScaffold(tripId, TripTab.OVERVIEW, "Overview", navController) { padding ->
                OverviewScreen(padding, onEdit = { navController.navigate("trip/$tripId/edit") })
            }
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
            val entryId = backStackEntry.arguments?.getString(ARG_ENTRY_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.TIMELINE, "Entry", navController, showBackButton = true,
                floatingActionButton = {
                    androidx.compose.material3.FloatingActionButton(onClick = { navController.navigate(entryEditRoute(tripId, entryId)) }) {
                        androidx.compose.material3.Icon(Icons.Filled.Edit, contentDescription = "Edit")
                    }
                },
            ) { padding ->
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
            val entryId = backStackEntry.arguments?.getString(ARG_ENTRY_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.BLOG, "Blog post", navController, showBackButton = true,
                floatingActionButton = {
                    androidx.compose.material3.FloatingActionButton(onClick = { navController.navigate(blogEditRoute(tripId, entryId)) }) {
                        androidx.compose.material3.Icon(Icons.Filled.Edit, contentDescription = "Edit")
                    }
                },
            ) { padding ->
                BlogDetailScreen(padding)
            }
        }
    }
}

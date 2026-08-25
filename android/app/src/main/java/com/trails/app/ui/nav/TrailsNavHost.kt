package com.trails.app.ui.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.trails.app.R
import com.trails.app.ui.settings.SettingsScreen
import com.trails.app.ui.blog.BlogDetailScreen
import com.trails.app.ui.blog.BlogEditScreen
import com.trails.app.ui.blog.BlogListScreen
import com.trails.app.ui.budget.BudgetScreen
import com.trails.app.ui.checklists.ChecklistDetailScreen
import com.trails.app.ui.checklists.ChecklistDetailViewModel
import com.trails.app.ui.checklists.ChecklistEditScreen
import com.trails.app.ui.checklists.ChecklistEditViewModel
import com.trails.app.ui.checklists.ChecklistsScreen
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.documents.DocumentsScreen
import com.trails.app.ui.entrydetail.EntryDetailScreen
import com.trails.app.ui.entrydetail.EntryEditScreen
import com.trails.app.ui.ideas.IdeaDetailScreen
import com.trails.app.ui.ideas.IdeaDetailViewModel
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
private const val ROUTE_SETTINGS = "settings"
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
private fun checklistDetailRoute(tripId: String, checklistId: String) = "trip/$tripId/checklists/$checklistId"
private fun checklistEditRoute(tripId: String, checklistId: String?) = "trip/$tripId/checklists/${checklistId ?: NEW_ID}/edit"
private val CHECKLISTS_LIST_ROUTE_PATTERN = "trip/{$ARG_TRIP_ID}/${TripTab.CHECKLISTS.route}"
private val IDEAS_LIST_ROUTE_PATTERN = "trip/{$ARG_TRIP_ID}/${TripTab.IDEAS.route}"
private fun infoEditRoute(tripId: String, infoId: String?) = "trip/$tripId/important-info/${infoId ?: NEW_ID}/edit"
private fun ideaEditRoute(tripId: String, ideaId: String?) = "trip/$tripId/ideas/${ideaId ?: NEW_ID}/edit"
private fun ideaDetailRoute(tripId: String, ideaId: String) = "trip/$tripId/ideas/$ideaId"

/**
 * Settings isn't Trip-scoped, so it can't use TripDrawerScaffold (which
 * requires a tripId) -- a minimal back-arrow Scaffold, same title-bar look,
 * following TripDrawerScaffold's own showBackButton styling.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsRoute(onBack: () -> Unit) {
    Scaffold(
        containerColor = TrailsColors.Canvas,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title), color = TrailsColors.Brand) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.shell_cd_back), tint = TrailsColors.Brand)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = TrailsColors.Surface),
            )
        },
    ) { padding -> SettingsScreen(padding) }
}

@Composable
private fun AddFab(onClick: () -> Unit) {
    FloatingActionButton(onClick = onClick) { Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.shell_cd_add)) }
}

/** Timeline's own FAB offers a choice -- an Idea isn't scheduled yet (so it doesn't belong as a Timeline Entry until converted), and a Blog Post goes through its own editor, not the generic Entry one. */
@Composable
private fun AddEntryOrIdeaFab(onAddEntry: () -> Unit, onAddIdea: () -> Unit, onAddBlogPost: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    androidx.compose.foundation.layout.Box {
        FloatingActionButton(onClick = { expanded = true }) { Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.shell_cd_add)) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.shell_entry)) }, onClick = { expanded = false; onAddEntry() })
            DropdownMenuItem(text = { Text(stringResource(R.string.shell_idea)) }, onClick = { expanded = false; onAddIdea() })
            DropdownMenuItem(text = { Text(stringResource(R.string.shell_blog_post)) }, onClick = { expanded = false; onAddBlogPost() })
        }
    }
}

@Composable
fun TrailsNavHost(navController: NavHostController = rememberNavController()) {
    // Fires at most once per app session, right after landing on the trip
    // list from login (fresh or auto-relogin) -- user-reported: "If a trip
    // is active the Android app automatically opens that trip's timeline."
    // Deliberately NOT re-checked on every visit to the trip list (e.g. the
    // drawer's "All Trips" item), which must stay a real escape hatch back
    // to the list rather than bouncing straight back into the active trip.
    var autoOpenActiveTripPending by remember { mutableStateOf(true) }

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
                // User-requested: the system back button/gesture must never
                // land on the trip list from inside a Trip -- popping
                // "trips" off here as Timeline is pushed means Timeline
                // itself has nothing left below it to fall back to.
                onOpenTrip = { tripId ->
                    navController.navigate(tripRoute(tripId, TripTab.TIMELINE.route)) {
                        popUpTo(ROUTE_TRIPS) { inclusive = true }
                    }
                },
                onAddTrip = { navController.navigate("trips/new/edit") },
                onOpenOverview = { tripId -> navController.navigate("trip/$tripId/overview") },
                onOpenSettings = { navController.navigate(ROUTE_SETTINGS) },
                autoOpenActiveTrip = autoOpenActiveTripPending,
                onAutoOpenConsumed = { autoOpenActiveTripPending = false },
            )
        }

        composable(ROUTE_SETTINGS) {
            SettingsRoute(onBack = { navController.popBackStack() })
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
                tripId, TripTab.TIMELINE, stringResource(R.string.shell_title_timeline), navController,
                floatingActionButton = {
                    AddEntryOrIdeaFab(
                        onAddEntry = { navController.navigate(entryEditRoute(tripId, null)) },
                        onAddIdea = { navController.navigate(ideaEditRoute(tripId, null)) },
                        onAddBlogPost = { navController.navigate(blogEditRoute(tripId, null)) },
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
            TripDrawerScaffold(tripId, TripTab.TIMELINE, stringResource(R.string.shell_title_edit_entry), navController, showBackButton = true) { padding ->
                EntryEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.SECTIONS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.SECTIONS, stringResource(R.string.shell_title_sections), navController,
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
            TripDrawerScaffold(tripId, TripTab.SECTIONS, stringResource(R.string.shell_title_edit_section), navController, showBackButton = true) { padding ->
                SectionEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IDEAS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.IDEAS, stringResource(R.string.shell_title_ideas), navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(ideaEditRoute(tripId, null)) }) },
            ) { padding ->
                // User-requested: tapping an Idea opens a read-only view
                // first -- editing is reached from there via its own Edit
                // action, same split ChecklistsScreen already uses.
                IdeasScreen(padding, onOpenIdea = { id -> navController.navigate(ideaDetailRoute(tripId, id)) })
            }
        }

        // User-requested: "When I click on an idea, it should open in view
        // mode, from there the user can enter edit mode" -- mirrors the
        // Checklist detail/edit split above. Convert-to-Entry lives here
        // (view mode), matching components/IdeaCard.tsx exactly; Delete
        // stays on IdeaEditScreen, reached via this screen's own Edit action.
        composable(
            route = "trip/{$ARG_TRIP_ID}/ideas/{$ARG_IDEA_ID}",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_IDEA_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            val ideaId = backStackEntry.arguments?.getString(ARG_IDEA_ID).orEmpty()
            val detailViewModel: IdeaDetailViewModel = hiltViewModel()
            val ideaEntity by detailViewModel.idea.collectAsState()
            TripDrawerScaffold(
                tripId, TripTab.IDEAS,
                ideaEntity?.title ?: stringResource(R.string.shell_idea),
                navController, showBackButton = true,
                actions = {
                    IconButton(onClick = { navController.navigate(ideaEditRoute(tripId, ideaId)) }) {
                        Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.shell_cd_edit), tint = TrailsColors.Brand)
                    }
                },
            ) { padding ->
                IdeaDetailScreen(
                    padding,
                    onConverted = { navController.popBackStack(IDEAS_LIST_ROUTE_PATTERN, inclusive = false) },
                    viewModel = detailViewModel,
                )
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
            TripDrawerScaffold(tripId, TripTab.IDEAS, stringResource(R.string.shell_title_edit_idea), navController, showBackButton = true) { padding ->
                // onDone only ever fires for an existing Idea's delete/convert
                // (a fresh create deliberately stays on this screen, see
                // IdeaEditScreen's own comment) -- reached via the Detail
                // screen's Edit action, so popping just one entry would land
                // back on that now-stale Detail screen instead of the list.
                IdeaEditScreen(padding, onDone = { navController.popBackStack(IDEAS_LIST_ROUTE_PATTERN, inclusive = false) })
            }
        }

        composable(
            route = CHECKLISTS_LIST_ROUTE_PATTERN,
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.CHECKLISTS, stringResource(R.string.shell_title_checklists), navController,
                floatingActionButton = { AddFab(onClick = { navController.navigate(checklistEditRoute(tripId, null)) }) },
            ) { padding ->
                ChecklistsScreen(padding, onOpenChecklist = { id -> navController.navigate(checklistDetailRoute(tripId, id)) })
            }
        }

        // User-requested: "When I click on a checklist, I should only see
        // its items and title" -- this view, not the edit form, is where
        // tapping a Checklist in the list now lands. Its own Edit button
        // (top-right) is the only way into ChecklistEditScreen for an
        // existing Checklist.
        composable(
            route = "trip/{$ARG_TRIP_ID}/checklists/{$ARG_CHECKLIST_ID}",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_CHECKLIST_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            val checklistId = backStackEntry.arguments?.getString(ARG_CHECKLIST_ID).orEmpty()
            val detailViewModel: ChecklistDetailViewModel = hiltViewModel()
            val checklistWithItems by detailViewModel.checklist.collectAsState()
            TripDrawerScaffold(
                tripId, TripTab.CHECKLISTS,
                checklistWithItems?.checklist?.title ?: stringResource(R.string.shell_title_checklist),
                navController, showBackButton = true,
                actions = {
                    IconButton(onClick = { navController.navigate(checklistEditRoute(tripId, checklistId)) }) {
                        Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.shell_cd_edit), tint = TrailsColors.Brand)
                    }
                },
            ) { padding -> ChecklistDetailScreen(padding, viewModel = detailViewModel) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/checklists/{$ARG_CHECKLIST_ID}/edit",
            arguments = listOf(
                navArgument(ARG_TRIP_ID) { type = NavType.StringType },
                navArgument(ARG_CHECKLIST_ID) { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            val editViewModel: ChecklistEditViewModel = hiltViewModel()
            val editState by editViewModel.state.collectAsState()
            // Save moved to the top app bar's action slot (user-requested);
            // this reacts once the save actually lands, forwarding to the
            // Detail screen for either a freshly-created or a just-edited
            // Checklist -- popUpTo the list so "back" from Detail returns
            // there directly, not into this now-stale Edit form.
            LaunchedEffect(editState.saved, editState.checklistId) {
                val savedId = editState.checklistId
                if (editState.saved && savedId != null) {
                    navController.navigate(checklistDetailRoute(tripId, savedId)) {
                        popUpTo(CHECKLISTS_LIST_ROUTE_PATTERN) { inclusive = false }
                    }
                }
            }
            TripDrawerScaffold(
                tripId, TripTab.CHECKLISTS,
                if (editState.checklistId == null) stringResource(R.string.shell_title_new_checklist) else stringResource(R.string.shell_title_edit_checklist),
                navController, showBackButton = true,
                actions = {
                    TextButton(onClick = editViewModel::save, enabled = !editState.saving) {
                        Text(stringResource(R.string.shell_save), color = TrailsColors.Brand)
                    }
                },
            ) { padding ->
                ChecklistEditScreen(
                    padding,
                    onDeleted = { navController.popBackStack(CHECKLISTS_LIST_ROUTE_PATTERN, inclusive = false) },
                    viewModel = editViewModel,
                )
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.IMPORTANT_INFO.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.IMPORTANT_INFO, stringResource(R.string.shell_title_important_info), navController,
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
            TripDrawerScaffold(tripId, TripTab.IMPORTANT_INFO, stringResource(R.string.shell_title_edit_important_info), navController, showBackButton = true) { padding ->
                ImportantInfoEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.BLOG.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(
                tripId, TripTab.BLOG, stringResource(R.string.shell_title_blog), navController,
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
            TripDrawerScaffold(tripId, TripTab.BLOG, stringResource(R.string.shell_title_edit_blog_post), navController, showBackButton = true) { padding ->
                BlogEditScreen(padding, onDone = { navController.popBackStack() })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.BUDGET.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.BUDGET, stringResource(R.string.shell_title_budget), navController) { padding ->
                BudgetScreen(padding, onOpenEntry = { _, entryId -> navController.navigate(entryDetailRoute(tripId, entryId)) })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/${TripTab.DOCUMENTS.route}",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, TripTab.DOCUMENTS, stringResource(R.string.shell_title_documents), navController) { padding -> DocumentsScreen(padding) }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/overview",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            // No longer a drawer tab (user-requested -- reached from a
            // button on TripListScreen's own card instead), so no
            // TripTab to highlight and a back arrow rather than the
            // hamburger, matching Travel Mode's own equally-tab-less route.
            TripDrawerScaffold(tripId, null, stringResource(R.string.shell_overview), navController, showBackButton = true) { padding ->
                OverviewScreen(padding, onEdit = { navController.navigate("trip/$tripId/edit") })
            }
        }

        composable(
            route = "trip/{$ARG_TRIP_ID}/travel-mode",
            arguments = listOf(navArgument(ARG_TRIP_ID) { type = NavType.StringType }),
        ) { backStackEntry ->
            val tripId = backStackEntry.arguments?.getString(ARG_TRIP_ID).orEmpty()
            TripDrawerScaffold(tripId, null, stringResource(R.string.shell_travel_mode), navController) { padding ->
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
                tripId, TripTab.TIMELINE, stringResource(R.string.shell_entry), navController, showBackButton = true,
                floatingActionButton = {
                    androidx.compose.material3.FloatingActionButton(onClick = { navController.navigate(entryEditRoute(tripId, entryId)) }) {
                        androidx.compose.material3.Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.shell_cd_edit))
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
                tripId, TripTab.BLOG, stringResource(R.string.shell_title_blog_post), navController, showBackButton = true,
                floatingActionButton = {
                    androidx.compose.material3.FloatingActionButton(onClick = { navController.navigate(blogEditRoute(tripId, entryId)) }) {
                        androidx.compose.material3.Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.shell_cd_edit))
                    }
                },
            ) { padding ->
                BlogDetailScreen(padding)
            }
        }
    }
}

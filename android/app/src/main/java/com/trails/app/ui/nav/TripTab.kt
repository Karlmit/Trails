package com.trails.app.ui.nav

import androidx.annotation.StringRes
import com.trails.app.R

// User-requested drawer order. Travel Mode is deliberately not in this
// list (it isn't a tab on the web either -- see TripDrawerScaffold, it's a
// standalone action shown only for an ACTIVE trip). Overview is also
// deliberately not a tab any more (user-requested: "Move overview to a
// button on the trip in 'all trips' menu as a button on the trip") -- its
// own route in TrailsNavHost.kt still exists, just reached from
// TripListScreen's per-card button instead of from this drawer.
enum class TripTab(@StringRes val labelRes: Int, val route: String) {
    TIMELINE(R.string.shell_title_timeline, "timeline"),
    IDEAS(R.string.shell_title_ideas, "ideas"),
    CHECKLISTS(R.string.shell_title_checklists, "checklists"),
    DOCUMENTS(R.string.shell_title_documents, "documents"),
    BLOG(R.string.shell_title_blog, "blog"),
    IMPORTANT_INFO(R.string.shell_title_important_info, "important-info"),
    BUDGET(R.string.shell_title_budget, "budget"),
    SECTIONS(R.string.shell_title_sections, "sections"),
}

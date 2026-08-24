package com.trails.app.ui.nav

// User-requested drawer order. Travel Mode is deliberately not in this
// list (it isn't a tab on the web either -- see TripDrawerScaffold, it's a
// standalone action shown only for an ACTIVE trip). Overview is also
// deliberately not a tab any more (user-requested: "Move overview to a
// button on the trip in 'all trips' menu as a button on the trip") -- its
// own route in TrailsNavHost.kt still exists, just reached from
// TripListScreen's per-card button instead of from this drawer.
enum class TripTab(val label: String, val route: String) {
    TIMELINE("Timeline", "timeline"),
    IDEAS("Ideas", "ideas"),
    CHECKLISTS("Checklists", "checklists"),
    DOCUMENTS("Documents", "documents"),
    BLOG("Blog", "blog"),
    IMPORTANT_INFO("Important Info", "important-info"),
    BUDGET("Budget", "budget"),
    SECTIONS("Sections", "sections"),
}

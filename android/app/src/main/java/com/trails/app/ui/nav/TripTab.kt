package com.trails.app.ui.nav

// Mirrors TripTabs.tsx's 9 tabs, in the same order. Travel Mode is
// deliberately not in this list (it isn't a tab on the web either --
// see TripDrawerScaffold, it's a standalone action shown only for an
// ACTIVE trip).
enum class TripTab(val label: String, val route: String) {
    TIMELINE("Timeline", "timeline"),
    SECTIONS("Sections", "sections"),
    IDEAS("Ideas", "ideas"),
    CHECKLISTS("Checklists", "checklists"),
    IMPORTANT_INFO("Important Info", "important-info"),
    BLOG("Blog", "blog"),
    BUDGET("Budget", "budget"),
    DOCUMENTS("Documents", "documents"),
    OVERVIEW("Overview", "overview"),
}

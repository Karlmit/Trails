package com.trails.app.ui.nav

import android.net.Uri
import com.trails.app.auth.SessionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RootSessionNavigationTest {
    @Test
    fun `invalidated session outside login routes to login`() {
        assertTrue(shouldNavigateToLogin(SessionState.Unauthenticated, "trip/id/timeline"))
    }

    @Test
    fun `login destination does not loop and valid session stays put`() {
        assertFalse(shouldNavigateToLogin(SessionState.Unknown, "trip/id/timeline"))
        assertFalse(shouldNavigateToLogin(SessionState.Unauthenticated, "login"))
        assertFalse(shouldNavigateToLogin(SessionState.Authenticated, "trip/id/timeline"))
    }

    @Test
    fun `viewer route carries only encoded attachment id`() {
        val id = "ticket / #1?å"
        val route = documentViewerRoute(id)
        assertEquals(id, Uri.parse(route).getQueryParameter(ARG_ATTACHMENT_ID))
        assertFalse(route.contains("documentPath"))
    }
}

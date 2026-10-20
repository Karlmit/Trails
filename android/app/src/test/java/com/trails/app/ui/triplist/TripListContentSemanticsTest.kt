package com.trails.app.ui.triplist

import android.content.Context
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import com.trails.app.R
import com.trails.app.data.entity.TripEntity
import com.trails.app.ui.theme.TrailsTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TripListContentSemanticsTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `active long-title trip exposes title overview and offline refresh actions`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val overview = context.getString(R.string.shell_overview)
        val refresh = context.getString(R.string.shell_refresh)
        val title = "A very long active journey through Stockholm, Vaxholm, Sandhamn and the outer archipelago"
        var openedOverview: String? = null
        var refreshedOffline: String? = null
        val trip = TripEntity(
            id = "active", name = title, destination = "Stockholm archipelago",
            startDate = "2026-07-01", endDate = "2026-07-31", timezone = "Europe/Stockholm",
            description = null, coverImage = "file:///definitely-missing-cover.jpg", visibility = "PRIVATE",
            pinnedActive = true, status = "ACTIVE", durationDays = 31,
            createdAt = "2026-01-01", updatedAt = "2026-01-01", cachedOffline = true,
        )

        compose.setContent {
            TrailsTheme {
                TripListContent(
                    state = TripListUiState(trips = listOf(trip)),
                    onOpenTrip = {},
                    onOpenOverview = { openedOverview = it },
                    onSaveOffline = { refreshedOffline = it },
                )
            }
        }

        compose.onNodeWithText(title).assertIsDisplayed()
        compose.onNodeWithText(overview).assertIsDisplayed().assertHasClickAction().performClick()
        compose.onNodeWithText(refresh).performScrollTo().assertIsDisplayed().assertHasClickAction().performClick()
        assertEquals("active", openedOverview)
        assertEquals("active", refreshedOffline)
    }
}

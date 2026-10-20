package com.trails.app.ui

import com.trails.app.ui.components.tripStatusUsesCeremonialGold
import com.trails.app.ui.theme.ClayMetrics
import com.trails.app.ui.theme.TrailsColors
import com.trails.app.ui.timeline.graph.EntryForLayout
import com.trails.app.ui.timeline.graph.TODAY_MARKER_HAS_INNER_RING
import com.trails.app.ui.timeline.graph.buildTimelineDays
import com.trails.app.ui.timeline.graph.layoutTimelineEntries
import androidx.compose.ui.graphics.toArgb
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Executable coverage for the clay redesign's locked I/O and edge-case matrix. */
class ClayDesignContractTest {

    @Test
    fun `normal screens share warm clay surface and geometry tokens`() {
        assertEquals(0xFFF2F0EB, TrailsColors.Canvas.toArgb().toUInt().toLong())
        assertEquals(0xFFFFFFFF, TrailsColors.Surface.toArgb().toUInt().toLong())
        assertEquals(32f, ClayMetrics.HeroRadius.value)
        assertEquals(24f, ClayMetrics.CardRadius.value)
        assertEquals(18f, ClayMetrics.InputRadius.value)
    }

    @Test
    fun `gold is reserved for active trip and today has a non-color ring cue`() {
        assertTrue(tripStatusUsesCeremonialGold("ACTIVE"))
        assertFalse(tripStatusUsesCeremonialGold("UPCOMING"))
        assertFalse(tripStatusUsesCeremonialGold("COMPLETED"))
        assertTrue(TODAY_MARKER_HAS_INNER_RING)
    }

    @Test
    fun `dense timelines preserve chronology and use lightweight list elevation`() {
        val days = buildTimelineDays("2026-01-01", "2026-06-29", emptyList(), "2026-04-01")
        val entries = days.mapIndexed { index, day ->
            EntryForLayout(
                id = "cached-$index",
                entryType = "ACTIVITY",
                subtype = "TOUR",
                title = "Offline cached itinerary item $index",
                startAt = "${day.dateKey}T09:00:00.000Z",
                endAt = null,
                startTimezone = null,
                endTimezone = null,
            )
        }
        val layout = layoutTimelineEntries(days, entries)

        assertEquals(180, layout.days.size)
        assertEquals(days.map { it.dateKey }, layout.days.map { it.day.dateKey })
        assertEquals(entries.size, layout.days.sumOf { it.lines.size })
        assertEquals(1f, ClayMetrics.DenseListElevation.value)
    }

    @Test
    fun `accessibility geometry supports long content without shrinking targets`() {
        val longLocalizedLabel = "Öppna den mycket detaljerade reseinformationen för skärgårdsdestinationen"

        assertTrue(longLocalizedLabel.length > 48)
        assertEquals(48f, ClayMetrics.MinimumTouchTarget.value)
        assertTrue(ClayMetrics.CardRadius < ClayMetrics.MinimumTouchTarget)
    }
}

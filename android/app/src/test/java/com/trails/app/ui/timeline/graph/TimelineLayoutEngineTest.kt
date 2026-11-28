package com.trails.app.ui.timeline.graph

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimelineLayoutEngineTest {

    @Test
    fun `buildTimelineDays covers every day inclusive, flags today and section membership`() {
        val days = buildTimelineDays(
            tripStartDateKey = "2026-08-01",
            tripEndDateKey = "2026-08-05",
            sections = listOf(SectionRange("s1", "2026-08-02", "2026-08-03")),
            todayKey = "2026-08-02",
        )
        assertEquals(5, days.size)
        assertEquals(listOf("2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"), days.map { it.dateKey })
        assertNull(days[0].sectionIndex)
        assertEquals(0, days[1].sectionIndex)
        assertEquals(0, days[2].sectionIndex)
        assertNull(days[3].sectionIndex)
        assertTrue(days[1].isToday)
        assertTrue(days.filterIndexed { i, _ -> i != 1 }.none { it.isToday })
    }

    @Test
    fun `starts are listed on the shared date even while the previous section owns the band`() {
        val days = buildTimelineDays(
            tripStartDateKey = "2026-11-17",
            tripEndDateKey = "2026-11-27",
            sections = listOf(
                SectionRange("previous", "2026-11-16", "2026-11-23"),
                SectionRange("long", "2026-11-23", "2026-11-27"),
                SectionRange("short", "2026-11-23", "2026-11-23"),
                SectionRange("past", "2026-11-10", "2026-11-15"),
            ),
            todayKey = null,
        )
        val sharedStart = days.first { it.dateKey == "2026-11-23" }

        assertEquals(0, sharedStart.sectionIndex)
        assertEquals(listOf(2, 1), sharedStart.startingSectionIndices)
        assertEquals(emptyList<Int>(), days.first { it.dateKey == "2026-11-24" }.startingSectionIndices)
        assertEquals(listOf(0), days.first().startingSectionIndices)
    }

    @Test
    fun `a single-day entry produces one line with no branch`() {
        val days = buildTimelineDays("2026-08-01", "2026-08-03", emptyList(), null)
        val entry = EntryForLayout(
            id = "e1", entryType = "ACTIVITY", subtype = "TOUR", title = "City walk",
            startAt = "2026-08-02T09:00:00.000Z", endAt = null, startTimezone = null, endTimezone = null,
        )
        val layout = layoutTimelineEntries(days, listOf(entry))
        assertEquals(0, layout.laneCount)
        val day2 = layout.days[1]
        assertEquals(1, day2.lines.size)
        assertTrue(day2.lines[0].isStart && day2.lines[0].isEnd)
        assertTrue(day2.branches.isEmpty())
    }

    @Test
    fun `a multi-day entry branches start-through-end across its span`() {
        val days = buildTimelineDays("2026-08-01", "2026-08-05", emptyList(), null)
        val stay = EntryForLayout(
            id = "stay1", entryType = "STAY", subtype = "HOTEL", title = "Beach Resort",
            startAt = "2026-08-02T14:00:00.000Z", endAt = "2026-08-04T11:00:00.000Z",
            startTimezone = null, endTimezone = null,
        )
        val layout = layoutTimelineEntries(days, listOf(stay))
        assertEquals(1, layout.laneCount)
        assertEquals(BranchPosition.START, layout.days[1].branches.single().position)
        assertEquals(BranchPosition.THROUGH, layout.days[2].branches.single().position)
        assertEquals(BranchPosition.END, layout.days[3].branches.single().position)
        assertTrue(layout.days[0].branches.isEmpty())
        assertTrue(layout.days[4].branches.isEmpty())
    }

    @Test
    fun `two non-overlapping multi-day entries reuse the same lane`() {
        val days = buildTimelineDays("2026-08-01", "2026-08-10", emptyList(), null)
        val first = EntryForLayout(
            "e1", "STAY", "HOTEL", "First", "2026-08-01T00:00:00.000Z", "2026-08-03T00:00:00.000Z", null, null,
        )
        val second = EntryForLayout(
            "e2", "TRANSPORT", "FLIGHT", "Second", "2026-08-05T00:00:00.000Z", "2026-08-07T00:00:00.000Z", null, null,
        )
        val layout = layoutTimelineEntries(days, listOf(first, second))
        assertEquals(1, layout.laneCount)
    }

    @Test
    fun `two genuinely overlapping multi-day entries claim separate lanes`() {
        val days = buildTimelineDays("2026-08-01", "2026-08-10", emptyList(), null)
        val first = EntryForLayout(
            "e1", "STAY", "HOTEL", "First", "2026-08-01T00:00:00.000Z", "2026-08-05T00:00:00.000Z", null, null,
        )
        val second = EntryForLayout(
            "e2", "TRANSPORT", "FLIGHT", "Second", "2026-08-03T00:00:00.000Z", "2026-08-07T00:00:00.000Z", null, null,
        )
        val layout = layoutTimelineEntries(days, listOf(first, second))
        assertEquals(2, layout.laneCount)
    }
}

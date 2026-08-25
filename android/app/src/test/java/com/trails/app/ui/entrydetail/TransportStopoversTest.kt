package com.trails.app.ui.entrydetail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TransportStopoversTest {

    @Test
    fun `parseStopovers returns empty list when typeDetails has no stopovers key`() {
        assertTrue(parseStopovers("""{"serviceNumber":"BA123"}""").isEmpty())
        assertTrue(parseStopovers(null).isEmpty())
        assertTrue(parseStopovers("").isEmpty())
    }

    @Test
    fun `parseStopovers reads every field of every stopover`() {
        val json = """
            {"serviceNumber":"BA123","stopovers":[
                {"location":"Dubai (DXB)","arrivalAt":"2026-08-03T14:00","departureAt":"2026-08-03T15:30","flightNumber":"EK456"},
                {"location":"Singapore (SIN)","arrivalAt":"2026-08-04T02:00","departureAt":"2026-08-04T04:00","flightNumber":null}
            ]}
        """.trimIndent()
        val stopovers = parseStopovers(json)
        assertEquals(2, stopovers.size)
        assertEquals(StopoverDraft("Dubai (DXB)", "2026-08-03T14:00", "2026-08-03T15:30", "EK456"), stopovers[0])
        assertEquals(StopoverDraft("Singapore (SIN)", "2026-08-04T02:00", "2026-08-04T04:00", ""), stopovers[1])
    }

    // Bug-fix regression: a `stopovers` JsonArray must never make the flat
    // typeDetails keys (parsed separately, EntryEditViewModel/
    // EntryDetailViewModel's own parseTypeDetails) disappear -- this test
    // guards parseStopovers's own half of that contract: it must not choke
    // on the other flat keys sitting alongside `stopovers`.
    @Test
    fun `parseStopovers tolerates flat sibling keys`() {
        val json = """{"terminal":"5","gate":"B12","stopovers":[{"location":"X","arrivalAt":"2026-08-03T14:00","departureAt":"2026-08-03T15:00"}]}"""
        assertEquals(1, parseStopovers(json).size)
    }

    @Test
    fun `stopoversToJsonArray round-trips through parseStopovers`() {
        val drafts = listOf(
            StopoverDraft("Dubai (DXB)", "2026-08-03T14:00", "2026-08-03T15:30", "EK456"),
            StopoverDraft("Singapore (SIN)", "2026-08-04T02:00", "2026-08-04T04:00", ""),
        )
        val json = """{"stopovers":${stopoversToJsonArray(drafts)}}"""
        val roundTripped = parseStopovers(json)
        assertEquals(drafts[0], roundTripped[0])
        assertEquals(drafts[1], roundTripped[1])
    }

    @Test
    fun `stopoversToJsonArray drops a row whose location is still blank`() {
        val drafts = listOf(StopoverDraft(location = "", arrivalAt = "2026-08-03T14:00", departureAt = "2026-08-03T15:00"))
        assertEquals(0, stopoversToJsonArray(drafts).size)
    }

    @Test
    fun `formatStopoverClock extracts HH-mm regardless of trailing seconds or Z`() {
        assertEquals("22:00", formatStopoverClock("2026-09-05T22:00"))
        assertEquals("22:00", formatStopoverClock("2026-09-05T22:00:00Z"))
    }

    @Test
    fun `formatStopoverDateTime includes month and day`() {
        assertEquals("Sep 5, 22:00", formatStopoverDateTime("2026-09-05T22:00"))
        assertEquals("Sep 5, 22:00", formatStopoverDateTime("2026-09-05T22:00:00Z"))
    }

    // Bug-fix regression: a `stopovers` JsonArray must never blank
    // terminal/gate/platform/serviceNumber/seat/baggageInfo -- the whole
    // reason parseFlatTypeDetails replaced the old
    // `.associate { k, v -> k to v.jsonPrimitive.content }` shape, which
    // threw (and was silently swallowed into emptyMap()) the moment any
    // value wasn't a JsonPrimitive.
    @Test
    fun `parseFlatTypeDetails keeps every flat key even when stopovers is a nested array`() {
        val json = """
            {"terminal":"5","gate":"B12","serviceNumber":"BA123","stopovers":[
                {"location":"Dubai (DXB)","arrivalAt":"2026-08-03T14:00","departureAt":"2026-08-03T15:30"}
            ]}
        """.trimIndent()
        val flat = parseFlatTypeDetails(json)
        assertEquals("5", flat["terminal"])
        assertEquals("B12", flat["gate"])
        assertEquals("BA123", flat["serviceNumber"])
        assertTrue(!flat.containsKey("stopovers"))
    }

    @Test
    fun `parseFlatTypeDetails returns empty map for null or blank input`() {
        assertTrue(parseFlatTypeDetails(null).isEmpty())
        assertTrue(parseFlatTypeDetails("").isEmpty())
    }
}

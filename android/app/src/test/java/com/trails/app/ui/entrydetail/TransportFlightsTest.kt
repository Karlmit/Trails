package com.trails.app.ui.entrydetail

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TransportFlightsTest {

    @Test
    fun `parseFlights returns empty list when typeDetails has no flights key`() {
        assertTrue(parseFlights("""{"baggageInfo":"Carousel 3"}""").isEmpty())
        assertTrue(parseFlights(null).isEmpty())
        assertTrue(parseFlights("").isEmpty())
    }

    @Test
    fun `parseFlights reads every field of every flight`() {
        val json = """
            {"baggageInfo":"Carousel 3","flights":[
                {"departureLocation":"Stockholm (ARN)","departureAt":"2026-08-03T10:00","departureTimezone":"Europe/Stockholm",
                 "arrivalLocation":"Dubai (DXB)","arrivalAt":"2026-08-03T14:00","arrivalTimezone":"Asia/Dubai",
                 "flightNumber":"EK123","terminal":"5","gate":"B12","platform":null,"seat":"14A"},
                {"departureLocation":"Dubai (DXB)","departureAt":"2026-08-03T15:30","departureTimezone":null,
                 "arrivalLocation":"Singapore (SIN)","arrivalAt":"2026-08-04T02:00","arrivalTimezone":null,
                 "flightNumber":null,"terminal":null,"gate":null,"platform":null,"seat":null}
            ]}
        """.trimIndent()
        val flights = parseFlights(json)
        assertEquals(2, flights.size)
        assertEquals(
            FlightDraft(
                departureLocation = "Stockholm (ARN)",
                departureAt = "2026-08-03T10:00",
                departureTimezone = "Europe/Stockholm",
                arrivalLocation = "Dubai (DXB)",
                arrivalAt = "2026-08-03T14:00",
                arrivalTimezone = "Asia/Dubai",
                flightNumber = "EK123",
                terminal = "5",
                gate = "B12",
                seat = "14A",
            ),
            flights[0],
        )
        assertEquals(
            FlightDraft(
                departureLocation = "Dubai (DXB)",
                departureAt = "2026-08-03T15:30",
                arrivalLocation = "Singapore (SIN)",
                arrivalAt = "2026-08-04T02:00",
            ),
            flights[1],
        )
    }

    // Bug-fix regression: a `flights` JsonArray must never make the flat
    // typeDetails keys (parsed separately, EntryEditViewModel/
    // EntryDetailViewModel's own parseFlatTypeDetails) disappear -- this
    // test guards parseFlights's own half of that contract: it must not
    // choke on the other flat keys sitting alongside `flights`.
    @Test
    fun `parseFlights tolerates flat sibling keys`() {
        val json = """{"baggageInfo":"Carousel 3","flights":[{"departureAt":"2026-08-03T14:00","arrivalAt":"2026-08-03T15:00"}]}"""
        assertEquals(1, parseFlights(json).size)
    }

    @Test
    fun `flightsToJsonArray round-trips through parseFlights`() {
        val drafts = listOf(
            FlightDraft(
                departureLocation = "Stockholm (ARN)",
                departureAt = "2026-08-03T10:00",
                departureTimezone = "Europe/Stockholm",
                arrivalLocation = "Dubai (DXB)",
                arrivalAt = "2026-08-03T14:00",
                flightNumber = "EK123",
            ),
            FlightDraft(departureAt = "2026-08-03T15:30", arrivalAt = "2026-08-04T02:00"),
        )
        val json = """{"flights":${flightsToJsonArray(drafts)}}"""
        val roundTripped = parseFlights(json)
        assertEquals(drafts[0], roundTripped[0])
        assertEquals(drafts[1], roundTripped[1])
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

    @Test
    fun `stopoverGapLabel prefers the earlier flight's own arrival location`() {
        val first = FlightDraft(arrivalLocation = "Dubai (DXB)", arrivalAt = "2026-08-03T14:00")
        val second = FlightDraft(departureLocation = "Dubai Intl", departureAt = "2026-08-03T15:30")
        assertEquals("⏱ Stopover at Dubai (DXB): 14:00–15:30", stopoverGapLabel(first, second))
    }

    @Test
    fun `stopoverGapLabel falls back to the next flight's departure location`() {
        val first = FlightDraft(arrivalAt = "2026-08-03T14:00")
        val second = FlightDraft(departureLocation = "Dubai (DXB)", departureAt = "2026-08-03T15:30")
        assertEquals("⏱ Stopover at Dubai (DXB): 14:00–15:30", stopoverGapLabel(first, second))
    }

    // Bug-fix regression: a `flights` JsonArray must never blank
    // `baggageInfo` -- the whole reason parseFlatTypeDetails replaced the
    // old `.associate { k, v -> k to v.jsonPrimitive.content }` shape,
    // which threw (and was silently swallowed into emptyMap()) the moment
    // any value wasn't a JsonPrimitive.
    @Test
    fun `parseFlatTypeDetails keeps every flat key even when flights is a nested array`() {
        val json = """
            {"baggageInfo":"Carousel 3","flights":[
                {"departureAt":"2026-08-03T10:00","arrivalAt":"2026-08-03T14:00"}
            ]}
        """.trimIndent()
        val flat = parseFlatTypeDetails(json)
        assertEquals("Carousel 3", flat["baggageInfo"])
        assertTrue(!flat.containsKey("flights"))
    }

    @Test
    fun `parseFlatTypeDetails returns empty map for null or blank input`() {
        assertTrue(parseFlatTypeDetails(null).isEmpty())
        assertTrue(parseFlatTypeDetails("").isEmpty())
    }
}

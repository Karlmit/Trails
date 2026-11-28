package com.trails.app.ui.blog

import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import java.io.IOException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Test

class OpenAiProofreaderTest {
    @Test
    fun `ChatGPT sends the selected paragraph and returns a suggestion for review`() = runTest {
        val source = "Vi tog en tuktuk för hinna fram."
        val correction = "Vi tog en tuktuk för att hinna fram."
        lateinit var request: Request
        val cloud = responseClient(200, completedResponse(correction)) { request = it }
        val settings = mockk<ProofreadingPreferences> {
            every { useChatGpt } returns true
            every { readApiKey() } returns "sk-test"
        }
        val proofreader = BlogProofreader(settings, cloud) { error("Local model used for online proofreading") }
        val runs = listOf(InlineRun(source))

        val suggestion = proofreader.proofread(runs, download = false) {} as ProofreadingSuggestion

        assertEquals("https://api.openai.com/v1/responses", request.url.toString())
        assertEquals("Bearer sk-test", request.header("Authorization"))
        val body = Buffer().apply { checkNotNull(request.body).writeTo(this) }.readUtf8()
        val payload = Json.parseToJsonElement(body).jsonObject
        assertEquals(JsonPrimitive(source), payload["input"])
        assertEquals(JsonPrimitive(false), payload["store"])
        val format = payload["text"]!!.jsonObject["format"]!!.jsonObject
        assertEquals(JsonPrimitive(true), format["strict"])
        assertEquals(runs, suggestion.originalRuns)
        assertEquals(correction, suggestion.correctedRuns.joinToString("") { it.text })
    }

    @Test
    fun `ChatGPT with no key makes no request and does not load the local model`() = runTest {
        val settings = mockk<ProofreadingPreferences> {
            every { useChatGpt } returns true
            every { readApiKey() } returns null
        }
        val cloud = mockk<OpenAiProofreader>()
        val proofreader = BlogProofreader(settings, cloud) { error("Local model used for online proofreading") }

        assertEquals(
            ProofreadingStatus.CloudKeyMissing,
            proofreader.proofread(listOf(InlineRun("Hej.")), download = false) {},
        )
        coVerify(exactly = 0) { cloud.correct(any(), any()) }
    }

    @Test
    fun `ChatGPT reports key and usage errors without exposing the response body`() = runTest {
        for ((code, expected) in listOf(
            401 to ProofreadingStatus.CloudKeyRejected,
            403 to ProofreadingStatus.CloudKeyRejected,
            429 to ProofreadingStatus.CloudRateLimited,
            503 to ProofreadingStatus.CloudFailed,
        )) {
            val cloud = responseClient(code, "private provider response")
            assertEquals(OpenAiProofreadingResult.Error(expected), cloud.correct("Hej.", "sk-test"))
        }
    }

    @Test
    fun `incomplete or refused output is never offered as a correction`() {
        assertEquals(
            OpenAiProofreadingResult.Error(ProofreadingStatus.TooLong),
            parseOpenAiProofreadingResponse(
                """{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}""",
            ),
        )
        assertEquals(
            OpenAiProofreadingResult.Error(ProofreadingStatus.InvalidSuggestion),
            parseOpenAiProofreadingResponse(
                """{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"Refused"}]}]}""",
            ),
        )
    }

    @Test
    fun `dismissing proofreading cancels the in-flight request`() = runTest {
        val call = mockk<Call>()
        justRun { call.enqueue(any()) }
        justRun { call.cancel() }
        val cloud = OpenAiProofreader(Call.Factory { call })

        val proofreading = launch(start = CoroutineStart.UNDISPATCHED) {
            cloud.correct("Hej.", "sk-test")
        }
        proofreading.cancelAndJoin()

        verify(exactly = 1) { call.cancel() }
    }

    @Test
    fun `transport errors show a connection failure`() = runTest {
        val call = mockk<Call>()
        every { call.enqueue(any()) } answers {
            firstArg<Callback>().onFailure(call, IOException("Test transport error"))
        }
        val cloud = OpenAiProofreader(Call.Factory { call })

        assertEquals(
            OpenAiProofreadingResult.Error(ProofreadingStatus.CloudConnectionFailed),
            cloud.correct("Hej.", "sk-test"),
        )
    }

    private fun responseClient(code: Int, body: String, onRequest: (Request) -> Unit = {}) =
        OpenAiProofreader(Call.Factory { request ->
            onRequest(request)
            val call = mockk<Call>()
            every { call.enqueue(any()) } answers {
                val response = Response.Builder().request(request).protocol(Protocol.HTTP_1_1)
                    .code(code).message("Test response").body(body.toResponseBody()).build()
                firstArg<Callback>().onResponse(call, response)
            }
            call
        })

    private fun completedResponse(correction: String): String {
        val text = JsonPrimitive("""{"text":${JsonPrimitive(correction)}}""")
        return """{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":$text}]}]}"""
    }
}

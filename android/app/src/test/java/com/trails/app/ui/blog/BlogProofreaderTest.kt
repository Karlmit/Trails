package com.trails.app.ui.blog

import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Candidate
import com.google.mlkit.genai.prompt.CountTokensResponse
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerativeModel
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class BlogProofreaderTest {
    private val model = mockk<GenerativeModel>()
    private val proofreader = BlogProofreader { model }

    @Test
    fun `a downloadable model waits for explicit consent`() = runTest {
        coEvery { model.checkStatus() } returnsMany listOf(
            FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADABLE, FeatureStatus.AVAILABLE,
        )
        every { model.close() } returns Unit
        every { model.download() } returns flowOf(DownloadStatus.DownloadCompleted)
        stubInference()
        stubCandidate("Tre dagar.")
        val source = listOf(InlineRun("Tre dagar."))

        assertEquals(ProofreadingStatus.Downloadable, proofreader.proofread(source, false) {})
        verify(exactly = 0) { model.download() }
        coVerify(exactly = 0) { model.generateContent(any<GenerateContentRequest>()) }

        val status = mutableListOf<ProofreadingStatus>()
        assertEquals(ProofreadingStatus.NoChanges, proofreader.proofread(source, true) { status.add(it) })
        assertEquals(listOf(ProofreadingStatus.Downloading, ProofreadingStatus.Generating), status)
        verify(exactly = 1) { model.download() }
        verify(exactly = 2) { model.close() }
    }

    @Test
    fun `failed inference after a completed download reports an inference error`() = runTest {
        coEvery { model.checkStatus() } returnsMany listOf(FeatureStatus.DOWNLOADABLE, FeatureStatus.AVAILABLE)
        every { model.close() } returns Unit
        every { model.download() } returns flowOf(DownloadStatus.DownloadCompleted)
        stubInference()
        coEvery { model.generateContent(any<GenerateContentRequest>()) } throws IllegalStateException()

        assertEquals(ProofreadingStatus.Failed, proofreader.proofread(listOf(InlineRun("Tre dagar.")), true) {})
        verify(exactly = 1) { model.close() }
    }

    @Test
    fun `an output truncated by the model token limit asks for a shorter block`() = runTest {
        readyModel()
        stubCandidate("Tre dagar.", Candidate.FinishReason.MAX_TOKENS)

        assertEquals(ProofreadingStatus.TooLong, proofreader.proofread(listOf(InlineRun("Trre dagar.")), false) {})
    }

    @Test
    fun `a correction must preserve the number of paragraph line breaks`() = runTest {
        readyModel()
        val source = listOf(InlineRun("Tre dagr.\r\nVi gick hem."))
        stubCandidate("Tre dagar. Vi gick hem.")
        assertEquals(ProofreadingStatus.InvalidSuggestion, proofreader.proofread(source, false) {})
        stubCandidate("Tre dagar.\n\nVi gick hem.")
        assertEquals(ProofreadingStatus.InvalidSuggestion, proofreader.proofread(source, false) {})

        val corrected = "Tre dagar.\nVi gick hem."
        stubCandidate(corrected)
        val suggestion = proofreader.proofread(source, false) {} as ProofreadingSuggestion
        assertEquals(corrected, suggestion.correctedRuns.joinToString("") { it.text })
    }

    private fun readyModel() {
        coEvery { model.checkStatus() } returns FeatureStatus.AVAILABLE
        every { model.close() } returns Unit
        stubInference()
    }

    private fun stubInference() {
        coEvery { model.countTokens(any<GenerateContentRequest>()) } returns CountTokensResponse(50)
        coEvery { model.getTokenLimit() } returns 1_024
    }

    private fun stubCandidate(text: String, reason: Int = Candidate.FinishReason.STOP) {
        val response = """{"text":${JsonPrimitive(text)}}"""
        val candidate = mockk<Candidate>()
        every { candidate.finishReason } returns reason
        every { candidate.text } returns response
        coEvery { model.generateContent(any<GenerateContentRequest>()) } returns mockk {
            every { candidates } returns listOf(candidate)
        }
    }
}

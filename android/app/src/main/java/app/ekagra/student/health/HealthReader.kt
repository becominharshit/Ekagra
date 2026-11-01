package app.ekagra.student.health

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.Period

/**
 * Everything that touches Health Connect (androidx.health.connect:connect-client), in one place.
 * Only HealthBridgePlugin calls it, and only on Android 9+, where Health Connect exists: on older
 * phones this class is never loaded. Reading only: the app never writes to Health Connect.
 */
internal object HealthReader {

    /** Read sleep and steps; nothing else. Must match the permissions in AndroidManifest.xml. */
    val PERMISSIONS: Set<String> = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
    )

    private val AWAKE_STAGES = setOf(
        SleepSessionRecord.STAGE_TYPE_AWAKE,
        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
    )

    /** available, needs_update (Health Connect is too old) or not_installed (Android 9–13 without the app). */
    fun status(context: Context): String = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
        else -> "not_installed"
    }

    suspend fun hasAccess(context: Context): Boolean =
        HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().containsAll(PERMISSIONS)

    /** Health Connect's own screen that asks the student to allow reading sleep and steps. */
    fun accessIntent(context: Context): Intent =
        PermissionController.createRequestPermissionResultContract().createIntent(context, PERMISSIONS)

    /** Whether the student allowed both, from that screen's result. */
    fun accessGranted(resultCode: Int, data: Intent?): Boolean =
        PermissionController.createRequestPermissionResultContract().parseResult(resultCode, data).containsAll(PERMISSIONS)

    /** Health Connect's settings, where the student can see and change what each app may read. */
    fun settingsIntent(): Intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)

    data class Sleep(val start: Long, val end: Long, val minutes: Long)

    /** Sleep sessions between two moments (epoch ms); minutes asleep leave out the stages marked awake. */
    suspend fun readSleep(context: Context, from: Long, to: Long): List<Sleep> {
        val client = HealthConnectClient.getOrCreate(context)
        val sessions = mutableListOf<Sleep>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(Instant.ofEpochMilli(from), Instant.ofEpochMilli(to)),
                    pageToken = pageToken,
                ),
            )
            for (record in response.records) {
                val total = record.endTime.toEpochMilli() - record.startTime.toEpochMilli()
                val awake = record.stages
                    .filter { it.stage in AWAKE_STAGES }
                    .sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
                sessions.add(Sleep(record.startTime.toEpochMilli(), record.endTime.toEpochMilli(), ((total - awake).coerceAtLeast(0L)) / 60_000L))
            }
            pageToken = response.pageToken
        } while (pageToken != null)
        return sessions
    }

    /**
     * Steps per local day, from one date to another ('YYYY-MM-DD', both included). Health Connect
     * adds them up itself, so a phone and a watch counting the same walk aren't counted twice.
     */
    suspend fun readSteps(context: Context, from: String, to: String): List<Pair<String, Long>> {
        val client = HealthConnectClient.getOrCreate(context)
        val days = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(LocalDate.parse(from).atStartOfDay(), LocalDate.parse(to).plusDays(1).atStartOfDay()),
                timeRangeSlicer = Period.ofDays(1),
            ),
        )
        return days.mapNotNull { day -> day.result[StepsRecord.COUNT_TOTAL]?.let { steps -> day.startTime.toLocalDate().toString() to steps } }
    }
}

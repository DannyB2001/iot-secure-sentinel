#include <stdbool.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

/*
 * MVP firmware skeleton for IoT Secure Sentinel.
 * The code is written as a portable example and must be adapted
 * to the concrete HARDWARIO SDK APIs used in the project.
 */

#define DEVICE_ID "node-01"
#define ALARM_THRESHOLD_G 1.20f

typedef struct
{
    float temperature_c;
    float accel_g;
    float battery_voltage;
    bool alarm;
} telemetry_t;

static float read_temperature_c(void)
{
    /* Replace with HARDWARIO temperature sensor read. */
    return 24.7f;
}

static float read_accel_g(void)
{
    /* Replace with HARDWARIO accelerometer magnitude or delta read. */
    return 0.18f;
}

static float read_battery_voltage(void)
{
    /* Replace with battery measurement if available. */
    return 2.95f;
}

static const char *current_timestamp_iso8601(void)
{
    /*
     * Replace with RTC-backed timestamp generation.
     * Static demo value keeps the sample payload deterministic.
     */
    return "2026-03-22T10:15:00Z";
}

static void send_payload(const char *payload)
{
    /*
     * Replace with radio or USB transport function.
     * For early bring-up, this could be redirected to UART logging.
     */
    puts(payload);
}

static telemetry_t sample_telemetry(void)
{
    telemetry_t data;
    data.temperature_c = read_temperature_c();
    data.accel_g = read_accel_g();
    data.battery_voltage = read_battery_voltage();
    data.alarm = data.accel_g >= ALARM_THRESHOLD_G;
    return data;
}

static void publish_telemetry(const telemetry_t *data)
{
    char payload[256];

    snprintf(
        payload,
        sizeof(payload),
        "{\"deviceId\":\"%s\",\"timestamp\":\"%s\",\"temperatureC\":%.2f,\"accelG\":%.2f,\"alarm\":%s,\"batteryVoltage\":%.2f,\"transport\":\"radio\"}",
        DEVICE_ID,
        current_timestamp_iso8601(),
        data->temperature_c,
        data->accel_g,
        data->alarm ? "true" : "false",
        data->battery_voltage
    );

    send_payload(payload);
}

int main(void)
{
    /*
     * Replace this loop with the HARDWARIO scheduler or event framework.
     * The intent is:
     * 1. periodically read sensors
     * 2. classify alarm state locally
     * 3. publish a normalized JSON payload
     */
    for (;;)
    {
        telemetry_t data = sample_telemetry();
        publish_telemetry(&data);

        /*
         * Insert platform-specific sleep or scheduler yield here.
         * Alarm-capable firmware can shorten the publish interval or
         * trigger immediate send on interrupt from the accelerometer.
         */
        break;
    }

    return 0;
}

package com.ascend.habittracker;

import android.os.Bundle;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class PermissionsRationaleActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView copy = new TextView(this);
        int pad = Math.round(20 * getResources().getDisplayMetrics().density);
        copy.setPadding(pad, pad, pad, pad);
        copy.setText(
            "Ascend reads sleep sessions from Health Connect so Report can show your Sleep ring. "
                + "Sleep hours stay on-device unless you export a CSV. You can revoke access in Health Connect settings."
        );
        copy.setTextSize(16);
        setContentView(copy);
    }
}

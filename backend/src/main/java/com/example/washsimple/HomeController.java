package com.example.washsimple;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class HomeController {

    // Option A: simple text response at root
    @GetMapping("/")
    @ResponseBody
    public String home() {
        return "WashSimple backend is running. Use /api/machines or serve frontend build in /static.";
    }

}

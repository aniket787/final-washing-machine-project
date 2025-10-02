package com.example.washsimple.controller;

import com.example.washsimple.service.MachineService;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/machines")
@CrossOrigin(origins = "http://localhost:3000")
public class MachineController {
    private final MachineService service;
    public MachineController(MachineService service){this.service=service;}

    @GetMapping
    public List<?> list(){ return service.list(); }

    @PostMapping("/join")
    public Map<String,Object> join(@RequestBody Map<String,Object> body){
        Long machineId = Long.valueOf(body.get("machineId").toString());
        Long userId = Long.valueOf(body.get("userId").toString());
        return service.joinQueue(machineId, userId);
    }

    @PostMapping("/start")
    public Map<String,Object> start(@RequestBody Map<String,Object> body){
        Long machineId = Long.valueOf(body.get("machineId").toString());
        Long userId = Long.valueOf(body.get("userId").toString());
        int minutes = Integer.parseInt(body.getOrDefault("minutes", 50).toString());
        return service.startWashing(machineId, userId, minutes);
    }
}
